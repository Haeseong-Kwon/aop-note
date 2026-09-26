import { workspaceRepo } from '../main/repositories/workspace.repo'
import { categoryRepo } from '../main/repositories/category.repo'
import { taskRepo } from '../main/repositories/task.repo'
import { searchRepo } from '../main/repositories/search.repo'
import { linkRepo, resolveIn } from '../main/repositories/link.repo'
import { loadSettings } from '../main/settings'
import { writeVault } from '../main/vault'
import { getProjectIndex, validateFolder } from '../main/projectIndex'
import { getGitInfo } from '../main/git'
import { resolve, sep } from 'path'
import { realpathSync } from 'fs'
import { extractLinks } from '@shared/links'
import type { Priority, TaskWithContext, Workspace } from '@shared/types'

export interface Tool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  run: (args: Record<string, unknown>) => string
}

const MAX_TITLE = 200
const MAX_MARKDOWN = 100_000
const DEFAULT_LIMIT = 10

// ---- input validation (arguments come from a model; fail with a message it can act on) ----

function str(args: Record<string, unknown>, key: string, max: number, required = true): string {
  const v = args[key]
  if (v === undefined || v === null || v === '') {
    if (required) throw new Error(`'${key}' is required.`)
    return ''
  }
  if (typeof v !== 'string') throw new Error(`'${key}' must be a string.`)
  if (v.length > max) throw new Error(`'${key}' is longer than ${max} characters.`)
  return v.trim()
}

function findDesk(ref: string): Workspace {
  const desks = workspaceRepo.list()
  const desk = desks.find((w) => w.id === ref || w.name.toLowerCase() === ref.toLowerCase())
  if (!desk) throw new Error(`Desk '${ref}' not found. Desks: ${desks.map((w) => w.name).join(', ')}`)
  return desk
}

function localMidnightIso(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd) || Number.isNaN(new Date(`${ymd}T00:00:00`).getTime())) {
    throw new Error(`'due' must be a date like 2026-10-01.`)
  }
  return new Date(`${ymd}T00:00:00`).toISOString()
}

const json = (value: unknown): string => JSON.stringify(value, null, 2)
const where = (t: TaskWithContext): string => `${t.workspace_name} / ${t.category_name}`
const localDate = (iso: string): string => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** The app's Markdown mirror should reflect agent writes too, not only in-app edits. */
function syncVault(): void {
  const root = loadSettings().vaultPath
  if (!root) return
  try {
    writeVault(root)
  } catch (error) {
    console.error('[mcp] vault sync failed:', error) // stderr: stdout carries the protocol
  }
}

function findNote(args: Record<string, unknown>): TaskWithContext {
  const id = str(args, 'id', 100, false)
  const title = str(args, 'title', MAX_TITLE, false)
  if (!id && !title) throw new Error("Give 'id' or 'title'.")
  const note = id ? taskRepo.listAllWithContext().find((t) => t.id === id) : linkRepo.resolve(title, null)
  if (!note) throw new Error(`Note '${id || title}' not found. Use search_notes to find it.`)
  return note
}

// ---- projects: a desk linked to a local folder ----

const BRIEF_TASKS = 15
const BRIEF_NOTES = 5
const BRIEF_COMMITS = 5
const BRIEF_DOCS = 20

/** The desk whose linked folder contains `dir` (deepest link wins), or null. */
function deskForDir(dir: string): Workspace | null {
  // Compare real paths: /tmp vs /private/tmp, symlinked checkouts.
  const real = (p: string): string => {
    try {
      return realpathSync(p)
    } catch {
      return resolve(p)
    }
  }
  const target = real(dir)
  const inside = (linked: string): boolean => {
    const folder = real(linked)
    return target === folder || target.startsWith(folder.endsWith(sep) ? folder : folder + sep)
  }
  return (
    workspaceRepo
      .list()
      .filter((w) => w.folder_path && inside(w.folder_path))
      .sort((a, b) => (b.folder_path?.length ?? 0) - (a.folder_path?.length ?? 0))[0] ?? null
  )
}

/**
 * What an agent should know when it starts working in this folder: the desk's open
 * tasks, recently touched notes, git state and docs. Null when no desk is linked,
 * so the SessionStart hook stays silent in unrelated repos.
 */
export function projectBrief(dir: string): string | null {
  const desk = deskForDir(dir)
  if (!desk?.folder_path) return null
  const tasks = taskRepo.listAllWithContext().filter((t) => t.workspace_id === desk.id)
  const open = tasks.filter((t) => t.status !== 'done').slice(0, BRIEF_TASKS)
  const recent = [...tasks]
    .filter((t) => t.note.trim())
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, BRIEF_NOTES)
  const git = getGitInfo(desk.folder_path)
  const docs = getProjectIndex(desk.folder_path)?.files ?? []

  const lines = [
    `# AOP Note 프로젝트: ${desk.name}`,
    '',
    `- 폴더: ${desk.folder_path}`,
    git
      ? `- git: ${git.branch ?? 'detached HEAD'} · 변경 ${git.changed}개${git.ahead ? ` · 푸시 안 한 커밋 ${git.ahead}` : ''}`
      : '- git: 저장소 아님',
    ...(git?.commits.slice(0, BRIEF_COMMITS).map((c) => `  - ${c.short} ${c.subject}`) ?? []),
    '',
    `## 열린 작업 (${open.length})`,
    ...(open.length
      ? open.map(
          (t) =>
            `- ${t.title}${t.due_date ? ` (기한 ${localDate(t.due_date)})` : ''}${t.priority ? ` [우선순위 ${t.priority}]` : ''} — id ${t.id}`
        )
      : ['- 없음']),
    '',
    '## 최근 수정한 메모',
    ...(recent.length
      ? recent.map((t) => `- ${t.title} — id ${t.id}: ${t.note.trim().split('\n')[0].slice(0, 120)}`)
      : ['- 없음']),
    '',
    `## 프로젝트 문서 (${docs.length})`,
    ...docs.slice(0, BRIEF_DOCS).map((d) => `- ${d.path}`),
    ...(docs.length > BRIEF_DOCS ? [`- … 외 ${docs.length - BRIEF_DOCS}개`] : []),
    '',
    '메모 본문은 read_note로 읽고, 작업 중 내린 결정·배운 점은 append_to_note / create_note로 이 데스크에 남기세요. 관련 메모·문서는 [[제목]] / [[docs/파일]]로 연결하세요.'
  ]
  return lines.join('\n')
}

export const TOOLS: Tool[] = [
  {
    name: 'get_project_context',
    description:
      'Call this first when working in a code repository: given the current working directory, returns the linked desk\'s open tasks, recent notes, git state and docs.',
    inputSchema: {
      type: 'object',
      properties: { cwd: { type: 'string', description: 'Absolute path of the current working directory' } },
      required: ['cwd']
    },
    run: (args) => {
      const cwd = str(args, 'cwd', 4096)
      return (
        projectBrief(cwd) ??
        `No AOP Note desk is linked to ${cwd}. Desks: ${workspaceRepo
          .list()
          .map((w) => (w.folder_path ? `${w.name} (→ ${w.folder_path})` : w.name))
          .join(', ')}. To link this repository, call link_project with a desk and the repository root path.`
      )
    }
  },
  {
    name: 'link_project',
    description: 'Link a local folder (usually the repository root) to a desk, so its docs join the knowledge graph and get_project_context works there.',
    inputSchema: {
      type: 'object',
      properties: { desk: { type: 'string', description: 'Desk name or id' }, path: { type: 'string', description: 'Absolute folder path' } },
      required: ['desk', 'path']
    },
    run: (args) => {
      const desk = findDesk(str(args, 'desk', MAX_TITLE))
      const folder = validateFolder(str(args, 'path', 4096))
      workspaceRepo.setFolder(desk.id, folder)
      return json({ desk: desk.name, folder })
    }
  },
  {
    name: 'list_desks',
    description: 'List desks (top-level areas/projects) and their categories. Call this before create_note.',
    inputSchema: { type: 'object', properties: {} },
    run: () =>
      json(
        workspaceRepo.list().map((w) => ({
          desk: w.name,
          id: w.id,
          categories: categoryRepo.listByWorkspace(w.id).map((c) => ({ name: c.name, id: c.id, child: Boolean(c.parent_id) }))
        }))
      )
  },
  {
    name: 'search_notes',
    description: 'Full-text search over note titles and bodies across all desks. Search before creating a note to avoid duplicates.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' }, limit: { type: 'number', description: `Default ${DEFAULT_LIMIT}` } },
      required: ['query']
    },
    run: (args) => {
      const query = str(args, 'query', MAX_TITLE)
      const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.min(args.limit, 50) : DEFAULT_LIMIT
      const hits = searchRepo.query(query).filter((h) => h.type === 'task').slice(0, limit)
      return json(
        hits.map((h) => {
          const note = taskRepo.getById(h.id)?.note ?? ''
          const line = note.split('\n').find((l) => l.toLowerCase().includes(query.toLowerCase()))
          return { id: h.id, title: h.title, where: h.subtitle, match: line?.trim().slice(0, 200) ?? null }
        })
      )
    }
  },
  {
    name: 'read_note',
    description: 'Read one note (Markdown body, status, due date) with the notes it links to ([[Title]]) and the notes linking back to it.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, title: { type: 'string' } }
    },
    run: (args) => {
      const note = findNote(args)
      const tasks = taskRepo.listAllWithContext()
      const out = extractLinks(note.note).map((l) => {
        const hit = resolveIn(tasks, l.target, note.workspace_id)
        return `- [[${l.target}]] → ${hit ? `${hit.id} (${where(hit)})` : 'not written yet'}`
      })
      const back = linkRepo.backlinks(note.id).linked.map((h) => `- ${h.task.title} (${h.task.id}): ${h.snippet}`)
      return [
        `# ${note.title}`,
        '',
        `- id: ${note.id}`,
        `- where: ${where(note)}`,
        `- status: ${note.status}${note.due_date ? `, due ${localDate(note.due_date)}` : ''}${note.priority ? `, priority ${note.priority}` : ''}`,
        '',
        '## Body',
        '',
        note.note.trim() || '(empty)',
        '',
        '## Links out',
        '',
        out.length ? out.join('\n') : '(none)',
        '',
        '## Linked from',
        '',
        back.length ? back.join('\n') : '(none)'
      ].join('\n')
    }
  },
  {
    name: 'list_tasks',
    description: 'List tasks/notes, optionally filtered by desk, status and due window. Defaults to open (not done) items.',
    inputSchema: {
      type: 'object',
      properties: {
        desk: { type: 'string', description: 'Desk name or id' },
        status: { type: 'string', enum: ['open', 'done', 'all'] },
        due_within_days: { type: 'number', description: 'Only items due within N days (overdue included)' }
      }
    },
    run: (args) => {
      const deskRef = str(args, 'desk', MAX_TITLE, false)
      const desk = deskRef ? findDesk(deskRef) : null
      const status = str(args, 'status', 10, false) || 'open'
      const days = typeof args.due_within_days === 'number' ? args.due_within_days : null
      const limit = days === null ? null : Date.now() + days * 86_400_000
      const rows = taskRepo
        .listAllWithContext()
        .filter((t) => !desk || t.workspace_id === desk.id)
        .filter((t) => status === 'all' || (status === 'done' ? t.status === 'done' : t.status !== 'done'))
        .filter((t) => limit === null || (t.due_date !== null && new Date(t.due_date).getTime() <= limit))
      return json(
        rows.map((t) => ({
          id: t.id,
          title: t.title,
          where: where(t),
          status: t.status,
          due: t.due_date ? localDate(t.due_date) : null,
          priority: t.priority
        }))
      )
    }
  },
  {
    name: 'create_note',
    description:
      'Create a note (a task with a Markdown body) in a desk/category. Link related notes with [[Exact Title]] in the body so they show up in backlinks and the graph.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        desk: { type: 'string', description: 'Desk name or id (see list_desks)' },
        category: { type: 'string', description: 'Category name or id within the desk' },
        markdown: { type: 'string' },
        due: { type: 'string', description: 'YYYY-MM-DD' },
        priority: { type: 'number', enum: [0, 1, 2, 3] }
      },
      required: ['title', 'desk', 'category']
    },
    run: (args) => {
      const title = str(args, 'title', MAX_TITLE)
      const desk = findDesk(str(args, 'desk', MAX_TITLE))
      const categoryRef = str(args, 'category', MAX_TITLE)
      const categories = categoryRepo.listByWorkspace(desk.id)
      const category = categories.find((c) => c.id === categoryRef || c.name.toLowerCase() === categoryRef.toLowerCase())
      if (!category) {
        throw new Error(`Category '${categoryRef}' not in '${desk.name}'. Categories: ${categories.map((c) => c.name).join(', ')}`)
      }
      const due = str(args, 'due', 10, false)
      const priority = args.priority
      if (priority !== undefined && ![0, 1, 2, 3].includes(priority as number)) throw new Error("'priority' must be 0–3.")
      const task = taskRepo.create({
        category_id: category.id,
        title,
        note: str(args, 'markdown', MAX_MARKDOWN, false),
        due_date: due ? localMidnightIso(due) : null,
        priority: (priority as Priority | undefined) ?? 0
      })
      syncVault()
      return json({ id: task.id, title: task.title, where: `${desk.name} / ${category.name}` })
    }
  },
  {
    name: 'append_to_note',
    description: 'Append Markdown to the end of an existing note (e.g. findings, decisions, links to other notes).',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, markdown: { type: 'string' } },
      required: ['id', 'markdown']
    },
    run: (args) => {
      const task = taskRepo.getById(str(args, 'id', 100))
      if (!task) throw new Error(`Note '${String(args.id)}' not found.`)
      const markdown = str(args, 'markdown', MAX_MARKDOWN)
      const note = task.note.trim() ? `${task.note.trimEnd()}\n\n${markdown}` : markdown
      taskRepo.update({ id: task.id, note })
      syncVault()
      return json({ id: task.id, title: task.title, length: note.length })
    }
  }
]
