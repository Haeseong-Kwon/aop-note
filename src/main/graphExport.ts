// The knowledge graph as an LLM "context pack": a legend, the hubs, a node table, the
// link list, then every node's content with its neighbourhood — or the same as JSON for
// tools. Pure rendering here; buildGraphExport() gathers the data from the app.
import { readFileSync, statSync } from 'fs'
import { extname } from 'path'
import { filterGraph, type GraphFilter } from '@shared/graphFilter'
import type { GraphData, GraphExportFormat, GraphExportRequest, GraphExportStats, GraphNode, TaskStatus } from '@shared/types'
import { linkRepo } from './repositories/link.repo'
import { taskRepo } from './repositories/task.repo'
import { workspaceRepo } from './repositories/workspace.repo'
import { projectFilePath } from './projectFiles'
import { TEXT_DOC_EXT } from './projectIndex'

export interface NoteInfo {
  body: string
  category: string
  status: TaskStatus
  due: string | null
}

export interface RenderContext {
  noteOf: (id: string) => NoteInfo | null
  /** Text of a Markdown / plain-text project document, or null. */
  fileText: (node: GraphNode) => string | null
  now: Date
}

export interface GraphExportOptions {
  title: string
  format: GraphExportFormat
  filter: GraphFilter
  includeBodies: boolean
  /** Per-node body cap in characters; null = whole body. */
  maxBodyChars: number | null
}

export interface GraphExportResult {
  content: string
  stats: GraphExportStats
}

const HUB_COUNT = 10
const MAX_FILE_BYTES = 256 * 1024
const KIND_LABEL: Record<GraphNode['kind'], string> = { note: '메모', file: '문서', folder: '폴더', ghost: '미작성', desk: '데스크', category: '카테고리' }
const STATUS_LABEL: Record<TaskStatus, string> = { todo: '할 일', doing: '진행 중', done: '완료' }

// Rough for Korean-heavy text (≈2 chars per token); shown as "약 N 토큰".
const estimateTokens = (text: string): number => Math.ceil(text.length / 2)
const cell = (s: string): string => s.replace(/\|/g, '\\|').replace(/\s+/g, ' ')
const dateOnly = (iso: string): string => iso.slice(0, 10)
const localStamp = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

/** Note headings sit under the node's "###": push them down so the outline stays intact. */
const demoteHeadings = (md: string): string => md.replace(/^(#{1,6})\s/gm, (_m, h: string) => `${'#'.repeat(Math.min(6, h.length + 3))} `)

function clip(body: string, max: number | null): string {
  const text = body.trim()
  if (max === null || text.length <= max) return text
  return `${text.slice(0, max).trimEnd()}\n\n…(이하 ${text.length - max}자 생략)`
}

interface Prepared {
  nodes: GraphNode[]
  ids: Map<string, string>
  /** [[link]] neighbours, by direction. */
  out: Map<string, string[]>
  into: Map<string, string[]>
  /** All edges kept (links + structure). */
  edges: GraphData['edges']
  links: GraphData['edges']
  /** Containment: parent → children. */
  children: Map<string, string[]>
}

// Containers before their contents when [[link]] counts tie.
const KIND_RANK: Record<GraphNode['kind'], number> = { desk: 0, category: 1, folder: 2, note: 3, file: 4, ghost: 5 }

/** Hubs first, so N1 is the most connected node — the pack's centre of gravity. */
function prepare(data: GraphData, filter: GraphFilter): Prepared {
  const { nodes: kept, edges } = filterGraph(data, filter)
  const links = edges.filter((e) => e.kind !== 'structure')
  // [[link]] counts inside the exported part: hubs are what the notes talk about, not
  // how big a folder is (containment is listed separately as a tree).
  const degree = new Map<string, number>()
  for (const e of links) for (const id of [e.source, e.target]) degree.set(id, (degree.get(id) ?? 0) + 1)
  const nodes = kept.map((n) => ({ ...n, links: degree.get(n.id) ?? 0 }))
  const sorted = [...nodes].sort((a, b) => b.links - a.links || KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.title.localeCompare(b.title))
  const ids = new Map(sorted.map((n, i) => [n.id, `N${i + 1}`]))
  const out = new Map<string, string[]>()
  const into = new Map<string, string[]>()
  for (const e of links) {
    out.set(e.source, [...(out.get(e.source) ?? []), e.target])
    into.set(e.target, [...(into.get(e.target) ?? []), e.source])
  }
  const children = new Map<string, string[]>()
  for (const e of edges) if (e.kind === 'structure') children.set(e.source, [...(children.get(e.source) ?? []), e.target])
  return { nodes: sorted, ids, out, into, edges, links, children }
}

function bodyOf(n: GraphNode, ctx: RenderContext, opts: GraphExportOptions): string | null {
  if (!opts.includeBodies) return null
  if (n.kind === 'note') return clip(ctx.noteOf(n.id)?.body ?? '', opts.maxBodyChars)
  if (n.kind === 'file') {
    const text = ctx.fileText(n)
    return text === null ? null : clip(text, opts.maxBodyChars)
  }
  return null
}

/** Containment as an indented outline, from the top-level containers down. */
function structureTree(p: Prepared, ref: (id: string) => string): string[] {
  if (p.children.size === 0) return []
  const kind = new Map(p.nodes.map((n) => [n.id, n.kind]))
  const title = new Map(p.nodes.map((n) => [n.id, n.title]))
  const hasParent = new Set([...p.children.values()].flat())
  const roots = [...p.children.keys()].filter((id) => !hasParent.has(id))
  const lines = ['## 구조', '']
  const seen = new Set<string>()
  const walk = (id: string, depth: number): void => {
    if (seen.has(id)) return
    seen.add(id)
    lines.push(`${'  '.repeat(depth)}- ${ref(id)} (${KIND_LABEL[kind.get(id) ?? 'note']})`)
    const kids = [...(p.children.get(id) ?? [])].sort((a, b) => (title.get(a) ?? '').localeCompare(title.get(b) ?? ''))
    for (const c of kids) walk(c, depth + 1)
  }
  roots.sort((a, b) => KIND_RANK[kind.get(a) ?? 'note'] - KIND_RANK[kind.get(b) ?? 'note'] || (title.get(a) ?? '').localeCompare(title.get(b) ?? ''))
  for (const r of roots) walk(r, 0)
  return [...lines, '']
}

function renderMarkdown(p: Prepared, ctx: RenderContext, opts: GraphExportOptions, scopeLabel: string): string {
  const ref = (id: string): string => `${p.ids.get(id)} ${p.nodes.find((n) => n.id === id)?.title ?? ''}`
  const where = (n: GraphNode): string => {
    const info = n.kind === 'note' ? ctx.noteOf(n.id) : null
    return [n.workspace_name, info?.category ?? (n.kind === 'file' || n.kind === 'folder' ? n.path : null)].filter(Boolean).join(' / ') || '—'
  }
  const lines = [
    `# 세컨드브레인: ${opts.title}`,
    '',
    `> AOP Note 지식 그래프 내보내기 · ${localStamp(ctx.now)} · 노드 ${p.nodes.length} · 링크 ${p.edges.length} · 범위: ${scopeLabel}`,
    '',
    '## 이 문서를 읽는 법',
    '',
    '- 노드는 메모, 프로젝트 문서, 폴더, 미작성(링크만 있고 아직 쓰이지 않은 메모)이며 `N1` 같은 id로 가리킵니다.',
    '- 폴더 → 하위 폴더 → 문서 링크는 연결된 폴더의 구조입니다(어느 문서가 어느 과목·주제 폴더에 있는지).',
    '- 링크 `A → B`는 A의 본문이 B를 [[위키링크]]로 언급한다는 뜻입니다. 서로 언급하면 한 번만 적습니다.',
    '- 구조는 데스크 ⊃ 카테고리 ⊃ 메모 ⊃ 하위 메모, 폴더 ⊃ 문서의 포함 관계입니다(들여쓰기가 한 단계 안쪽).',
    '- id는 연결이 많은 순서입니다. 앞쪽 노드(허브)가 이 지식의 중심 주제입니다.',
    '- 답할 때 근거가 된 노드를 `N12 제목`처럼 인용하세요.',
    '',
    '## 허브',
    '',
    ...p.nodes.slice(0, HUB_COUNT).filter((n) => n.links > 0).map((n, i) => `${i + 1}. ${ref(n.id)} — 연결 ${n.links}`),
    '',
    '## 노드',
    '',
    '| id | 제목 | 종류 | 위치 | 연결 |',
    '|---|---|---|---|---|',
    ...p.nodes.map((n) => `| ${p.ids.get(n.id)} | ${cell(n.title)} | ${KIND_LABEL[n.kind]} | ${cell(where(n))} | ${n.links} |`),
    '',
    '## 링크',
    '',
    ...(p.links.length ? p.links.map((e) => `- ${ref(e.source)} → ${ref(e.target)}`) : ['(링크 없음)']),
    '',
    ...structureTree(p, ref),
    '## 내용',
    ''
  ]
  for (const n of p.nodes) {
    const info = n.kind === 'note' ? ctx.noteOf(n.id) : null
    const meta = [`종류: ${KIND_LABEL[n.kind]}`, `위치: ${where(n)}`]
    if (info) meta.push(`상태: ${STATUS_LABEL[info.status]}`)
    if (info?.due) meta.push(`기한: ${dateOnly(info.due)}`)
    lines.push(`### ${p.ids.get(n.id)} · ${n.title}`, `- ${meta.join(' · ')}`)
    const outs = p.out.get(n.id) ?? []
    const ins = p.into.get(n.id) ?? []
    if (outs.length) lines.push(`- 언급함: ${outs.map(ref).join(', ')}`)
    if (ins.length) lines.push(`- 언급됨: ${ins.map(ref).join(', ')}`)
    const body = bodyOf(n, ctx, opts)
    if (n.kind === 'ghost') lines.push('', `(아직 작성되지 않은 메모 — ${ins.length || n.links}곳에서 언급)`)
    else if (body) lines.push('', demoteHeadings(body))
    else if (n.kind === 'file' && opts.includeBodies) lines.push('', `(본문 미포함: ${(extname(n.path ?? '').slice(1) || '파일').toUpperCase()} 파일)`)
    lines.push('')
  }
  return lines.join('\n')
}

function renderJson(p: Prepared, ctx: RenderContext, opts: GraphExportOptions, scopeLabel: string): string {
  return JSON.stringify(
    {
      format: 'aop-note-graph',
      version: 1,
      title: opts.title,
      exported_at: ctx.now.toISOString(),
      scope: scopeLabel,
      nodes: p.nodes.map((n) => {
        const info = n.kind === 'note' ? ctx.noteOf(n.id) : null
        return {
          id: p.ids.get(n.id),
          key: n.id,
          title: n.title,
          kind: n.kind,
          desk: n.workspace_name,
          category: info?.category ?? null,
          path: n.path,
          status: info?.status ?? null,
          due: info?.due ? dateOnly(info.due) : null,
          links: n.links,
          body: bodyOf(n, ctx, opts)
        }
      }),
      edges: p.edges.map((e) => ({ from: p.ids.get(e.source), to: p.ids.get(e.target), kind: e.kind ?? 'link' }))
    },
    null,
    2
  )
}

export function renderGraphExport(data: GraphData, ctx: RenderContext, opts: GraphExportOptions, scopeLabel = '전체'): GraphExportResult {
  const p = prepare(data, opts.filter)
  const content = opts.format === 'json' ? renderJson(p, ctx, opts, scopeLabel) : renderMarkdown(p, ctx, opts, scopeLabel)
  return { content, stats: { nodes: p.nodes.length, edges: p.edges.length, chars: content.length, tokens: estimateTokens(content) } }
}

export const scopeLabelFor = (filter: GraphFilter): string =>
  (filter.scope ? `${workspaceRepo.getById(filter.scope)?.name ?? '데스크'} 데스크` : '전체') +
  (filter.focus ? ` · 검색 결과 ${filter.focus.length}개 + 이웃 ${filter.hops ?? 0}단계` : '') +
  (filter.structure === false ? ' · 링크만' : '')

const MAX_TITLE = 100
const MAX_HOPS = 3
const MAX_FOCUS = 5000

/** Renderer requests are untrusted input: normalise every field. */
export function toExportOptions(req: GraphExportRequest): GraphExportOptions {
  const r = (req ?? {}) as Partial<GraphExportRequest>
  const focus = Array.isArray(r.focus) ? r.focus.filter((id): id is string => typeof id === 'string').slice(0, MAX_FOCUS) : null
  const cap = typeof r.maxBodyChars === 'number' && Number.isFinite(r.maxBodyChars) ? Math.max(200, Math.round(r.maxBodyChars)) : null
  return {
    title: (typeof r.title === 'string' ? r.title.trim() : '').slice(0, MAX_TITLE) || '세컨드브레인',
    format: r.format === 'json' ? 'json' : 'md',
    filter: {
      scope: typeof r.scope === 'string' ? r.scope : null,
      linkedOnly: r.linkedOnly === true,
      focus,
      hops: Math.min(MAX_HOPS, Math.max(0, Math.round(Number(r.hops) || 0))),
      structure: r.structure !== false
    },
    includeBodies: r.includeBodies !== false,
    maxBodyChars: cap
  }
}

/** The export from live app data. */
export function buildGraphExport(opts: GraphExportOptions): GraphExportResult {
  const tasks = new Map(taskRepo.listAllWithContext().map((t) => [t.id, t]))
  const ctx: RenderContext = {
    noteOf: (id) => {
      const t = tasks.get(id)
      return t ? { body: t.note, category: t.category_name, status: t.status, due: t.due_date } : null
    },
    fileText: (n) => {
      if (!n.workspace_id || !n.path || !TEXT_DOC_EXT.test(n.path)) return null
      const abs = projectFilePath(n.workspace_id, n.path)
      if (!abs || statSync(abs).size > MAX_FILE_BYTES) return null
      return readFileSync(abs, 'utf8')
    },
    now: new Date()
  }
  return renderGraphExport(linkRepo.graph(), ctx, opts, scopeLabelFor(opts.filter))
}
