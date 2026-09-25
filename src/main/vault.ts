import { basename, dirname, join } from 'path'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, rmdirSync, writeFileSync } from 'fs'
import { taskRepo } from './repositories/task.repo'
import { attachmentRepo } from './repositories/attachment.repo'
import { resolveIn } from './repositories/link.repo'
import { pathForStored } from './attachmentPaths'
import { extractLinks } from '@shared/links'
import type { TaskWithContext } from '@shared/types'

/**
 * One-way mirror of every note as an Obsidian-compatible Markdown vault, so Obsidian
 * (graph, plugins) and agents like Claude Code can read the whole knowledge base as
 * plain files. Everything lives under <root>/AOP Note/, and only files recorded in the
 * manifest are ever rewritten or deleted — anything else in the vault is left alone.
 */

export const VAULT_FOLDER = 'AOP Note'
const MANIFEST = '.aop-mirror.json'
const ATTACHMENTS = '_attachments'
const INDEX = 'AOP Note.md'

// Characters Obsidian / file systems reject in note names, plus link syntax.
const UNSAFE = /[\\/:*?"<>|#^[\]]/g

export function fileNameFor(title: string): string {
  const name = title.replace(UNSAFE, '-').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').trim()
  return name || '제목 없음'
}

const localDate = (iso: string): string => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Vault-relative path (no extension) for every note; same-named notes in a folder get " (2)". */
function planPaths(tasks: TaskWithContext[], parentName: Map<string, string>): Map<string, string> {
  const used = new Set<string>()
  const paths = new Map<string, string>()
  for (const t of tasks) {
    const parent = parentName.get(t.category_id)
    const folder = [t.workspace_name, ...(parent ? [parent] : []), t.category_name].map(fileNameFor).join('/')
    const name = fileNameFor(t.title)
    let path = `${folder}/${name}`
    for (let n = 2; used.has(path.toLowerCase()); n++) path = `${folder}/${name} (${n})`
    used.add(path.toLowerCase())
    paths.set(t.id, path)
  }
  return paths
}

const STORED_URL = /(!?)\[([^\]]*)\]\(aop-file:\/\/\/?([^)\s]+)\)/g

/** Links → file names; aop-file:// embeds → vault attachments. Returns referenced attachments. */
function convertBody(t: TaskWithContext, tasks: TaskWithContext[], paths: Map<string, string>, files: Set<string>): string {
  let body = t.note
  // Right to left so earlier indices stay valid while splicing.
  for (const link of extractLinks(body).reverse()) {
    const hit = resolveIn(tasks, link.target, t.workspace_id)
    const file = hit ? basename(paths.get(hit.id) ?? '') : ''
    if (!file || file === link.target) continue
    const replacement = `[[${file}|${link.alias ?? link.target}]]`
    body = body.slice(0, link.index) + replacement + body.slice(link.index + link.length)
  }
  return body.replace(STORED_URL, (_m, bang: string, label: string, stored: string) => {
    const name = basename(decodeURIComponent(stored))
    files.add(name)
    return bang ? `![[${name}]]` : `[[${name}|${label || name}]]`
  })
}

function frontmatter(t: TaskWithContext, parent: string | undefined): string {
  const lines = [
    `aop_id: ${t.id}`,
    `desk: ${JSON.stringify(t.workspace_name)}`,
    `category: ${JSON.stringify(parent ? `${parent}/${t.category_name}` : t.category_name)}`,
    `status: ${t.status}`,
    ...(t.priority > 0 ? [`priority: ${t.priority}`] : []),
    ...(t.due_date ? [`due: ${localDate(t.due_date)}`] : []),
    ...(t.recurrence ? [`recurrence: ${t.recurrence}`] : []),
    `created: ${t.created_at}`,
    `updated: ${t.updated_at}`
  ]
  return `---\n${lines.join('\n')}\n---\n\n`
}

function indexNote(tasks: TaskWithContext[], paths: Map<string, string>): string {
  const out = [
    '# AOP Note',
    '',
    'AOP Note 앱이 자동으로 만드는 읽기 전용 미러입니다. 여기서 고친 내용은 다음 동기화 때 덮어써집니다.',
    ''
  ]
  let desk = ''
  let category = ''
  for (const t of [...tasks].sort((a, b) => (paths.get(a.id) ?? '').localeCompare(paths.get(b.id) ?? ''))) {
    if (t.workspace_name !== desk) {
      desk = t.workspace_name
      category = ''
      out.push('', `## ${desk}`)
    }
    if (t.category_name !== category) {
      category = t.category_name
      out.push('', `### ${category}`)
    }
    const file = basename(paths.get(t.id) ?? '')
    out.push(`- ${file === t.title ? `[[${file}]]` : `[[${file}|${t.title}]]`}`)
  }
  return out.join('\n') + '\n'
}

/** Write only when content changed, so Obsidian doesn't re-index untouched notes. */
function writeIfChanged(path: string, content: string): void {
  if (existsSync(path) && readFileSync(path, 'utf8') === content) return
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

function removeEmptyDirs(dir: string, stopAt: string): void {
  for (let d = dir; d.startsWith(stopAt) && d !== stopAt; d = dirname(d)) {
    if (!existsSync(d) || readdirSync(d).length > 0) return
    rmdirSync(d)
  }
}

export function writeVault(root: string): { written: number; removed: number } {
  const base = join(root, VAULT_FOLDER)
  mkdirSync(base, { recursive: true })

  const tasks = taskRepo.listAllWithContext()
  const categoryParent = new Map<string, string>(
    taskRepo.listCategoryParents().map((r) => [r.id, r.parent_name])
  )
  const paths = planPaths(tasks, categoryParent)
  const files = new Set<string>()
  const managed: string[] = []

  for (const t of tasks) {
    const rel = `${paths.get(t.id)}.md`
    let body = convertBody(t, tasks, paths, files)
    const attached = attachmentRepo.listByTask(t.id)
    if (attached.length > 0) {
      attached.forEach((a) => files.add(a.stored_name))
      body += `\n\n## 첨부 파일\n\n${attached.map((a) => `- [[${a.stored_name}|${a.file_name}]]`).join('\n')}\n`
    }
    writeIfChanged(join(base, rel), frontmatter(t, categoryParent.get(t.category_id)) + body.trimEnd() + '\n')
    managed.push(rel)
  }

  for (const name of files) {
    const from = pathForStored(name)
    const to = join(base, ATTACHMENTS, name)
    if (existsSync(from) && !existsSync(to)) {
      mkdirSync(dirname(to), { recursive: true })
      copyFileSync(from, to)
    }
    managed.push(`${ATTACHMENTS}/${name}`)
  }

  writeIfChanged(join(base, INDEX), indexNote(tasks, paths))
  managed.push(INDEX)

  // Remove what we wrote last time and no longer produce — never anything else.
  const manifestPath = join(base, MANIFEST)
  let previous: string[] = []
  try {
    previous = (JSON.parse(readFileSync(manifestPath, 'utf8')) as { files?: string[] }).files ?? []
  } catch {
    previous = [] // first run or unreadable manifest: remove nothing
  }
  const keep = new Set(managed)
  let removed = 0
  for (const rel of previous) {
    if (keep.has(rel) || rel.includes('..')) continue
    const abs = join(base, rel)
    rmSync(abs, { force: true })
    removeEmptyDirs(dirname(abs), base)
    removed++
  }
  writeFileSync(manifestPath, JSON.stringify({ files: managed }, null, 2))
  return { written: managed.length, removed }
}

export const vaultBase = (root: string): string => join(root, VAULT_FOLDER)

// ---- keeping the mirror current ----

const SYNC_DELAY_MS = 3000
let timer: ReturnType<typeof setTimeout> | null = null

/** Debounced: a burst of edits (typing in a memo) becomes one write. No-op when the mirror is off. */
export function scheduleVaultSync(getRoot: () => string): void {
  if (!getRoot()) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    const root = getRoot()
    if (!root) return
    try {
      writeVault(root)
    } catch (error) {
      console.error('[vault] sync failed:', error)
    }
  }, SYNC_DELAY_MS)
}
