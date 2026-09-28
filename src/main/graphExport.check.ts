import assert from 'node:assert'
import { renderGraphExport, type NoteInfo } from './graphExport'
import { graphArchive } from './graphArchive'
import type { GraphData, GraphNode } from '@shared/types'

const node = (id: string, title: string, links: number, kind: GraphNode['kind'] = 'note', extra: Partial<GraphNode> = {}): GraphNode => ({
  id, title, color: '', kind, path: null, workspace_id: 'd1', workspace_name: '캠페인', category_id: 'c1', links, attachment_id: null, ...extra
})
const data: GraphData = {
  nodes: [
    node('t-hub', '가격 | 정책', 3),
    node('t-a', '고객 인터뷰', 1),
    node('file:d1:docs/계약서.pdf', '계약서', 1, 'file', { path: 'docs/계약서.pdf' }),
    node('ghost:미정', '미정 아이디어', 1, 'ghost', { workspace_id: null, workspace_name: null, category_id: null }),
    node('t-lonely', '혼자', 0)
  ],
  edges: [
    { source: 't-hub', target: 't-a' },
    { source: 't-hub', target: 'file:d1:docs/계약서.pdf' },
    { source: 't-hub', target: 'ghost:미정' }
  ]
}
const notes: Record<string, NoteInfo> = {
  't-hub': { body: '# 목표\n할인은 [[고객 인터뷰]] 결과로 정한다. ' + '가'.repeat(300), category: '기획', status: 'doing', due: '2026-10-01T00:00:00.000Z' },
  't-a': { body: '응답자 12명', category: '기획', status: 'todo', due: null },
  't-lonely': { body: '링크 없음', category: '기획', status: 'todo', due: null }
}
const ctx = { noteOf: (id: string) => notes[id] ?? null, fileText: () => null, now: new Date('2026-09-28T09:00:00') }

// ---- Markdown: hubs first, a legend, link list, bodies with their neighbourhood ----
const md = renderGraphExport(data, ctx, {
  title: '캠페인 지식', format: 'md', filter: { scope: null, linkedOnly: true }, includeBodies: true, maxBodyChars: 100
})
assert.equal(md.stats.nodes, 4, 'orphans dropped with linkedOnly')
assert.equal(md.stats.edges, 3)
const text = md.content
assert.match(text, /^# 세컨드브레인: 캠페인 지식/)
assert.match(text, /## 이 문서를 읽는 법/)
assert.match(text, /\| N1 \| 가격 \\\| 정책 \| 메모 \|/, 'the hub gets N1; table pipes escaped')
assert.match(text, /- N1 가격 \| 정책 → N\d 고객 인터뷰/)
assert.match(text, /### N1 · 가격 \| 정책\n- 종류: 메모 · 위치: 캠페인 \/ 기획 · 상태: 진행 중 · 기한: 2026-10-01/)
assert.match(text, /- 언급함: .*고객 인터뷰/)
assert.match(text, /#### 목표/, 'note headings are demoted under the node heading')
assert.match(text, /…\(이하 \d+자 생략\)/, 'long bodies are cut at maxBodyChars')
assert.match(text, /계약서[\s\S]*본문 미포함: PDF/, 'binary documents: named, not dumped')
assert.match(text, /아직 작성되지 않은 메모/)
assert.ok(!text.includes('혼자'))
assert.ok(md.stats.tokens > 0 && md.stats.chars === text.length)

// Titles only
const lean = renderGraphExport(data, ctx, { title: 't', format: 'md', filter: { scope: null, linkedOnly: true }, includeBodies: false, maxBodyChars: null })
assert.ok(!lean.content.includes('응답자 12명') && lean.content.length < md.content.length)

// Focus: the search hit and its direct neighbours only
const focused = renderGraphExport(data, ctx, {
  title: 't', format: 'md', filter: { scope: null, linkedOnly: false, focus: ['t-a'], hops: 1 }, includeBodies: true, maxBodyChars: null
})
assert.equal(focused.stats.nodes, 2)
assert.match(focused.content, /\| N\d \| 가격 \\\| 정책 \| 메모 \| [^|]+ \| 1 \|/, 'link counts are within the exported part, not the whole graph')

// ---- JSON: machine-readable, same ids ----
const json = renderGraphExport(data, ctx, { title: 'j', format: 'json', filter: { scope: null, linkedOnly: true }, includeBodies: true, maxBodyChars: null })
const parsed = JSON.parse(json.content) as { format: string; nodes: { id: string; key: string; title: string; body: string | null }[]; edges: { from: string; to: string }[] }
assert.equal(parsed.format, 'aop-note-graph')
assert.equal(parsed.nodes[0].id, 'N1')
assert.equal(parsed.nodes[0].key, 't-hub')
assert.equal(parsed.edges.length, 3)
assert.ok(parsed.nodes.find((n) => n.key === 't-a')?.body?.includes('응답자'))

// ---- structure: containment shown as a tree, kept apart from the [[link]] list ----
const structured: GraphData = {
  nodes: [
    node('desk:d1', '캠페인', 2, 'desk'),
    node('category:c1', '기획', 3, 'category'),
    node('m1', '예산안', 2),
    node('m2', '세부 일정', 1),
    node('m3', '회고', 1)
  ],
  edges: [
    { source: 'm1', target: 'm3', kind: 'link' },
    { source: 'desk:d1', target: 'category:c1', kind: 'structure' },
    { source: 'category:c1', target: 'm1', kind: 'structure' },
    { source: 'm1', target: 'm2', kind: 'structure' },
    { source: 'category:c1', target: 'm3', kind: 'structure' }
  ]
}
const tree = renderGraphExport(structured, ctx, { title: 's', format: 'md', filter: { scope: null, linkedOnly: true }, includeBodies: false, maxBodyChars: null })
assert.match(tree.content, /## 구조\n\n- N\d+ 캠페인 \(데스크\)\n  - N\d+ 기획 \(카테고리\)\n    - N\d+ 예산안 \(메모\)\n      - N\d+ 세부 일정 \(메모\)/)
const linkSection = tree.content.split('## 링크')[1].split('##')[0]
assert.ok(linkSection.includes('예산안 → N') && !linkSection.includes('기획'), 'the link list is [[links]] only')
assert.match(tree.content, /### N\d+ · 예산안\n- 종류: 메모.*\n- 언급함: N\d+ 회고/)
const flat = renderGraphExport(structured, ctx, { title: 's', format: 'md', filter: { scope: null, linkedOnly: true, structure: false }, includeBodies: false, maxBodyChars: null })
assert.ok(!flat.content.includes('## 구조') && !flat.content.includes('캠페인 (데스크)'), 'links-only export has no structure')

// ---- archive: save / list / read / remove, newest first, names made safe ----
const first = graphArchive.save({ title: '캠페인/지식?', format: 'md', content: md.content, stats: md.stats, scopeLabel: '전체' })
const second = graphArchive.save({ title: 'JSON 팩', format: 'json', content: json.content, stats: json.stats, scopeLabel: '전체' })
assert.deepEqual(graphArchive.list().map((e) => e.id), [second.id, first.id])
assert.ok(!first.file.includes('/') && first.file.endsWith('.md'))
assert.equal(graphArchive.read(first.id), md.content)
graphArchive.remove(first.id)
assert.deepEqual(graphArchive.list().map((e) => e.id), [second.id])
assert.throws(() => graphArchive.read(first.id), /보관함/)
console.log('graph export: all assertions passed')

// Requests from the renderer are normalised, not trusted.
import { toExportOptions } from './graphExport'
{
  const o = toExportOptions({ title: '  ', format: 'exe' as never, scope: 5 as never, linkedOnly: 'yes' as never, focus: [1, 'a'] as never, hops: 99, includeBodies: undefined as never, maxBodyChars: 3 })
  assert.equal(o.title, '세컨드브레인')
  assert.equal(o.format, 'md')
  assert.equal(o.filter.scope, null)
  assert.equal(o.filter.linkedOnly, false)
  assert.deepEqual(o.filter.focus, ['a'])
  assert.equal(o.filter.hops, 3)
  assert.equal(o.includeBodies, true)
  assert.equal(o.maxBodyChars, 200)
  console.log('graph export request: all assertions passed')
}
