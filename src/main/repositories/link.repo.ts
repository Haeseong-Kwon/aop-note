import { join } from 'path'
import { readFileSync } from 'fs'
import { taskRepo } from './task.repo'
import { workspaceRepo } from './workspace.repo'
import { getProjectIndex, resolveFile, type ProjectIndex } from '../projectIndex'
import { getGitInfo } from '../git'
import { extractLinks, normalizeTitle } from '@shared/links'
import type {
  Backlinks,
  BacklinkHit,
  CommitMention,
  FileBacklink,
  FileBacklinks,
  GraphData,
  GraphNode,
  TaskWithContext,
  Workspace
} from '@shared/types'

// ponytail: links are derived by scanning every live note (and each linked project's
// docs) on each call — fine for thousands of notes; add a links table maintained on
// save if it ever shows up in a profile.

const SNIPPET_MAX = 160

/** Same-desk note wins (like Obsidian's nearest match); otherwise the most recently edited. */
export function resolveIn(
  tasks: TaskWithContext[],
  title: string,
  fromWorkspaceId: string | null
): TaskWithContext | null {
  const key = normalizeTitle(title)
  const candidates = tasks.filter((t) => normalizeTitle(t.title) === key)
  if (candidates.length === 0) return null
  return (
    candidates.find((t) => t.workspace_id === fromWorkspaceId) ??
    [...candidates].sort((x, y) => y.updated_at.localeCompare(x.updated_at))[0]
  )
}

function lineAt(text: string, index: number): string {
  const start = text.lastIndexOf('\n', index - 1) + 1
  const end = text.indexOf('\n', index)
  return text.slice(start, end === -1 ? undefined : end).trim().slice(0, SNIPPET_MAX)
}

// ---- projects: desks linked to a local folder ----

interface Project {
  desk: Workspace
  index: ProjectIndex
}

function projects(): Project[] {
  return workspaceRepo.list().flatMap((desk) => {
    const index = desk.folder_path ? getProjectIndex(desk.folder_path) : null
    return index ? [{ desk, index }] : []
  })
}

type Target = { kind: 'note'; task: TaskWithContext } | { kind: 'file'; deskId: string; path: string }

const sameTarget = (a: Target | null, b: Target): boolean =>
  a !== null &&
  (a.kind === 'note' && b.kind === 'note'
    ? a.task.id === b.task.id
    : a.kind === 'file' && b.kind === 'file' && a.deskId === b.deskId && a.path === b.path)

/** From a note: a same-desk note, then that desk's project file, then a note elsewhere. */
function resolveFromNote(tasks: TaskWithContext[], all: Project[], target: string, deskId: string): Target | null {
  const note = resolveIn(tasks, target, deskId)
  if (note && note.workspace_id === deskId) return { kind: 'note', task: note }
  const project = all.find((p) => p.desk.id === deskId)
  const path = project ? resolveFile(project.index, target) : null
  if (path) return { kind: 'file', deskId, path }
  return note ? { kind: 'note', task: note } : null
}

/** From a project document: a file in the same project first, then notes. */
function resolveFromFile(tasks: TaskWithContext[], project: Project, target: string): Target | null {
  const path = resolveFile(project.index, target)
  if (path) return { kind: 'file', deskId: project.desk.id, path }
  const note = resolveIn(tasks, target, project.desk.id)
  return note ? { kind: 'note', task: note } : null
}

function readDoc(project: Project, path: string): string {
  try {
    return readFileSync(join(project.index.root, path), 'utf8')
  } catch {
    return '' // deleted since the index was built
  }
}

/** Project documents whose [[links]] or Markdown links reach `wanted`. */
function filesLinkingTo(tasks: TaskWithContext[], all: Project[], wanted: Target): FileBacklink[] {
  const hits: FileBacklink[] = []
  for (const project of all) {
    for (const f of project.index.files) {
      const viaWiki = f.links.find((l) => sameTarget(resolveFromFile(tasks, project, l), wanted))
      const viaMd =
        wanted.kind === 'file' && wanted.deskId === project.desk.id && f.fileLinks.includes(wanted.path)
      if (!viaWiki && !viaMd) continue
      if (wanted.kind === 'file' && wanted.deskId === project.desk.id && f.path === wanted.path) continue
      const text = readDoc(project, f.path)
      const at = viaWiki ? text.indexOf(`[[${viaWiki}`) : text.indexOf(wanted.kind === 'file' ? wanted.path.split('/').pop() ?? '' : '')
      hits.push({ workspace_id: project.desk.id, path: f.path, title: f.title, snippet: at >= 0 ? lineAt(text, at) : '' })
    }
  }
  return hits
}

export const linkRepo = {
  resolve(title: string, fromTaskId: string | null): TaskWithContext | null {
    const tasks = taskRepo.listAllWithContext()
    const from = tasks.find((t) => t.id === fromTaskId)
    return resolveIn(tasks, title, from?.workspace_id ?? null)
  },

  backlinks(taskId: string): Backlinks {
    const tasks = taskRepo.listAllWithContext()
    const target = tasks.find((t) => t.id === taskId)
    if (!target) return { linked: [], mentions: [], files: [], commits: [] }
    const wanted: Target = { kind: 'note', task: target }
    const all = projects()
    const key = normalizeTitle(target.title)

    const linked: BacklinkHit[] = []
    const mentions: BacklinkHit[] = []
    for (const t of tasks) {
      if (t.id === target.id || !t.note) continue
      const link = extractLinks(t.note).find((l) => sameTarget(resolveFromNote(tasks, all, l.target, t.workspace_id), wanted))
      if (link) {
        linked.push({ task: t, snippet: lineAt(t.note, link.index) })
        continue
      }
      // One-character titles would match everywhere; they're not worth suggesting.
      const at = key.length >= 2 ? t.note.toLowerCase().indexOf(key) : -1
      if (at >= 0) mentions.push({ task: t, snippet: lineAt(t.note, at) })
    }

    const commits: CommitMention[] = []
    for (const project of all) {
      for (const c of getGitInfo(project.index.root)?.commits ?? []) {
        const hit = extractLinks(c.subject).some((l) =>
          sameTarget(resolveFromNote(tasks, all, l.target, project.desk.id), wanted)
        )
        if (hit) commits.push({ workspace_id: project.desk.id, short: c.short, subject: c.subject, author: c.author, date: c.date })
      }
    }

    return { linked, mentions, files: filesLinkingTo(tasks, all, wanted), commits }
  },

  /** Notes and documents pointing at a project document. */
  fileBacklinks(deskId: string, path: string): FileBacklinks {
    const tasks = taskRepo.listAllWithContext()
    const all = projects()
    const wanted: Target = { kind: 'file', deskId, path }
    const linked: BacklinkHit[] = []
    for (const t of tasks) {
      const link = extractLinks(t.note).find((l) => sameTarget(resolveFromNote(tasks, all, l.target, t.workspace_id), wanted))
      if (link) linked.push({ task: t, snippet: lineAt(t.note, link.index) })
    }
    return { linked, files: filesLinkingTo(tasks, all, wanted) }
  },

  /** Notes with content or links, every project document, and ghosts for unwritten links. */
  graph(): GraphData {
    const tasks = taskRepo.listAllWithContext()
    const all = projects()
    const nodes = new Map<string, GraphNode>()
    const neighbours = new Map<string, Set<string>>()
    const edges: GraphData['edges'] = []

    const base = { workspace_id: null, workspace_name: null, category_id: null, path: null, links: 0 }
    const noteNode = (t: TaskWithContext): string => {
      if (!nodes.has(t.id)) {
        nodes.set(t.id, {
          ...base,
          id: t.id,
          title: t.title,
          color: t.workspace_color,
          kind: 'note',
          workspace_id: t.workspace_id,
          workspace_name: t.workspace_name,
          category_id: t.category_id
        })
      }
      return t.id
    }
    const fileId = (deskId: string, path: string): string => `file:${deskId}:${path}`
    const nodeFor = (target: Target): string =>
      target.kind === 'note' ? noteNode(target.task) : fileId(target.deskId, target.path)
    const ghost = (title: string, color: string): string => {
      const id = `ghost:${normalizeTitle(title)}`
      if (!nodes.has(id)) nodes.set(id, { ...base, id, title, color, kind: 'ghost' })
      return id
    }
    const connect = (source: string, target: string): void => {
      if (source === target || neighbours.get(source)?.has(target)) return
      for (const [x, y] of [
        [source, target],
        [target, source]
      ]) {
        if (!neighbours.has(x)) neighbours.set(x, new Set())
        neighbours.get(x)?.add(y)
      }
      edges.push({ source, target })
    }

    for (const project of all) {
      for (const f of project.index.files) {
        nodes.set(fileId(project.desk.id, f.path), {
          ...base,
          id: fileId(project.desk.id, f.path),
          title: f.title,
          color: project.desk.color,
          kind: 'file',
          path: f.path,
          workspace_id: project.desk.id,
          workspace_name: project.desk.name
        })
      }
    }

    for (const t of tasks) {
      if (t.note.trim()) noteNode(t)
      for (const l of extractLinks(t.note)) {
        const hit = resolveFromNote(tasks, all, l.target, t.workspace_id)
        connect(noteNode(t), hit ? nodeFor(hit) : ghost(l.target, t.workspace_color))
      }
    }

    for (const project of all) {
      for (const f of project.index.files) {
        const from = fileId(project.desk.id, f.path)
        for (const l of f.links) {
          const hit = resolveFromFile(tasks, project, l)
          connect(from, hit ? nodeFor(hit) : ghost(l, project.desk.color))
        }
        for (const p of f.fileLinks) connect(from, fileId(project.desk.id, p))
      }
    }

    for (const n of nodes.values()) n.links = neighbours.get(n.id)?.size ?? 0
    return { nodes: [...nodes.values()], edges }
  }
}
