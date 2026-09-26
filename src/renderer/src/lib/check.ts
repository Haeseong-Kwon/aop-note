import assert from 'node:assert'
import { matchSmartToken } from './smartTypography'

/** Mirrors the InputRule handler: replace the trailing "<token> " with "<symbol> ". */
function apply(textBeforeCaret: string): string {
  const hit = matchSmartToken(textBeforeCaret)
  if (!hit) return textBeforeCaret
  const from = textBeforeCaret.length - 1 - hit.token.length // -1: trailing space not yet in doc
  return textBeforeCaret.slice(0, from) + hit.symbol + ' '
}

assert.equal(apply('-> '), '→ ')
assert.equal(apply('a -> '), 'a → ')
assert.equal(apply('a --> '), 'a → ')      // longest token wins
assert.equal(apply('a <-> '), 'a ↔ ')
assert.equal(apply('a <--> '), 'a ↔ ')
assert.equal(apply('x -- '), 'x — ')
assert.equal(apply('x ... '), 'x … ')
assert.equal(apply('x (c) '), 'x © ')
assert.equal(apply('x != '), 'x ≠ ')
assert.equal(apply('일단 -> '), '일단 → ')
assert.equal(apply('a->'), 'a->')          // no trailing space: untouched
assert.equal(apply('a-> '), 'a-> ')        // mid-word: untouched
assert.equal(apply('x--> more'), 'x--> more')
assert.equal(apply('plain text '), 'plain text ')
console.log('smartTypography: all assertions passed')

// --- memoMarkdown: attachment round-trip -------------------------------------
import { extractFiles, restoreFileBlocks } from './memoMarkdown'

const NOTE =
  '![shot.png](aop-file:///a.png)[spec.pdf](aop-file:///b.pdf)\n\nattachment test\n'
const ex = extractFiles(NOTE)
assert.deepEqual(ex.files, [{ name: 'spec.pdf', url: 'aop-file:///b.pdf' }])
assert.equal(ex.markdown, '![shot.png](aop-file:///a.png)\n\n@@aop-file-0@@\n\nattachment test')

// The parser turns that markdown into these blocks; markers must become file blocks.
const parsed = [
  { type: 'image', props: { url: 'aop-file:///a.png' } },
  { type: 'paragraph', content: [{ type: 'text', text: '@@aop-file-0@@' }] },
  { type: 'paragraph', content: [{ type: 'text', text: 'attachment test' }] }
]
assert.deepEqual(restoreFileBlocks(parsed, ex.files), [
  { type: 'image', props: { url: 'aop-file:///a.png' } },
  { type: 'file', props: { url: 'aop-file:///b.pdf', name: 'spec.pdf' } },
  { type: 'paragraph', content: [{ type: 'text', text: 'attachment test' }] }
])

// Notes without attachments must pass through untouched.
assert.equal(extractFiles('# hi\n\nplain [link](https://x.dev)').files.length, 0)
assert.deepEqual(restoreFileBlocks(parsed, []), parsed)
console.log('memoMarkdown: all assertions passed')

// --- formatRelative -----------------------------------------------------------
import { formatRelative } from './format'

const NOW = new Date('2026-09-26T12:00:00')
assert.equal(formatRelative('2026-09-26T11:59:30', NOW), '방금')
assert.equal(formatRelative('2026-09-26T11:55:00', NOW), '5분 전')
assert.equal(formatRelative('2026-09-26T09:00:00', NOW), '3시간 전')
assert.equal(formatRelative('2026-09-21T09:00:00', NOW), '9월 21일')
console.log('formatRelative: all assertions passed')

// --- parseQuickInput: natural-language due dates + priority -------------------
import { parseQuickInput } from './parseQuickInput'

// Friday 2026-09-25 (weekday 5)
const FRI = new Date('2026-09-25T10:00:00')
const q = (text: string): [string, string | null, number | null] => {
  const r = parseQuickInput(text, FRI)
  return [r.title, r.due, r.priority]
}
assert.deepEqual(q('회의록 정리'), ['회의록 정리', null, null])
assert.deepEqual(q('오늘 회의록 정리'), ['회의록 정리', '2026-09-25', null])
assert.deepEqual(q('보고서 제출 내일'), ['보고서 제출', '2026-09-26', null])
assert.deepEqual(q('보고서 내일까지 제출'), ['보고서 제출', '2026-09-26', null])
assert.deepEqual(q('모레 미팅'), ['미팅', '2026-09-27', null])
assert.deepEqual(q('3일 후 리뷰'), ['리뷰', '2026-09-28', null])
assert.deepEqual(q('금요일 배포'), ['배포', '2026-09-25', null], 'same weekday = today')
assert.deepEqual(q('월요일 배포'), ['배포', '2026-09-28', null])
assert.deepEqual(q('다음주 수요일 배포'), ['배포', '2026-09-30', null])
assert.deepEqual(q('다음 주 월 킥오프'), ['킥오프', '2026-09-28', null])
assert.deepEqual(q('다음주 기획'), ['기획', '2026-09-28', null], 'bare 다음주 = next Monday')
assert.deepEqual(q('이번주 금요일까지 정리'), ['정리', '2026-09-25', null])
assert.deepEqual(q('견적 10/3'), ['견적', '2026-10-03', null])
assert.deepEqual(q('견적 10월 3일'), ['견적', '2026-10-03', null])
assert.deepEqual(q('연말정산 1/15'), ['연말정산', '2027-01-15', null], 'past date rolls to next year')
assert.deepEqual(q('긴급 수정 !!!'), ['긴급 수정', null, 3])
assert.deepEqual(q('! 내일 확인'), ['확인', '2026-09-26', 1])
// Words that merely contain a keyword are left alone.
assert.deepEqual(q('오늘의 회고'), ['오늘의 회고', null, null])
assert.deepEqual(q('월요일에 할 일 정리하기'), ['월요일에 할 일 정리하기', null, null])
assert.deepEqual(q('13/40 버전'), ['13/40 버전', null, null], 'impossible dates are not dates')
assert.deepEqual(q('내일'), ['내일', null, null], 'a lone keyword stays as the title')
console.log('parseQuickInput: all assertions passed')

// Repeat words set a recurrence; a routine with no date starts today.
const rq = (text: string): [string, string | null, string | null] => {
  const r = parseQuickInput(text, FRI)
  return [r.title, r.due, r.recurrence]
}
assert.deepEqual(rq('매일 스트레칭'), ['스트레칭', '2026-09-25', 'daily'])
assert.deepEqual(rq('평일마다 스탠드업'), ['스탠드업', '2026-09-25', 'weekdays'])
assert.deepEqual(rq('매주 월요일 주간회의'), ['주간회의', '2026-09-28', 'weekly'])
assert.deepEqual(rq('매월 25일 정산'), ['정산', '2026-09-25', 'monthly'], '"25일" = the 25th, today included')
assert.deepEqual(rq('30일 마감'), ['마감', '2026-09-30', null])
assert.deepEqual(rq('3일 미팅'), ['미팅', '2026-10-03', null], 'passed day of month → next month')
assert.deepEqual(rq('매달 카드값'), ['카드값', '2026-09-25', 'monthly'])
assert.deepEqual(rq('회의록 정리'), ['회의록 정리', null, null])
assert.deepEqual(rq('매일경제 스크랩'), ['매일경제 스크랩', null, null], 'only whole words')
console.log('parseQuickInput recurrence: all assertions passed')

// --- checklistProgress: memo checklists double as subtasks --------------------
import { checklistProgress } from './format'

assert.equal(checklistProgress(''), null)
assert.equal(checklistProgress('그냥 메모\n- 목록'), null)
assert.deepEqual(checklistProgress('- [x] 초안\n* [ ] 검토\n  - [X] 하위 항목\n+ [ ] 공유'), { done: 2, total: 4 })
assert.equal(checklistProgress('`- [ ]` 코드 안의 예시'), null, 'mid-line text is not an item')
console.log('checklistProgress: all assertions passed')

// --- sortTasks: list sort modes -------------------------------------------------
import { sortTasks } from './format'
import type { Task } from '@shared/types'

const mk = (id: string, priority: number, due: string | null, sort_order: number): Task =>
  ({ id, priority, due_date: due, sort_order, status: 'todo' }) as Task
const list = [mk('a', 1, null, 0), mk('b', 3, '2026-10-01', 1), mk('c', 0, '2026-09-28', 2), mk('d', 3, null, 3)]
const ids = (ts: Task[]): string => ts.map((t) => t.id).join('')
assert.equal(ids(sortTasks(list, 'manual')), 'abcd')
assert.equal(ids(sortTasks(list, 'due')), 'cbda', 'dated first, then no-date by priority')
assert.equal(ids(sortTasks(list, 'priority')), 'bdac', 'high first; ties by due date')
assert.equal(ids(list), 'abcd', 'input not mutated')
console.log('sortTasks: all assertions passed')

// Times become a reminder (and imply the date when none was given).
const tq = (text: string): [string, string | null, string | null] => {
  const r = parseQuickInput(text, FRI) // Fri 2026-09-25 10:00
  return [r.title, r.due, r.remindAt]
}
assert.deepEqual(tq('내일 오후 3시 미팅'), ['미팅', '2026-09-26', '2026-09-26T15:00'])
assert.deepEqual(tq('3시 회의'), ['회의', '2026-09-25', '2026-09-25T15:00'], '1–6시 without 오전 = afternoon')
assert.deepEqual(tq('9시 스탠드업'), ['스탠드업', '2026-09-26', '2026-09-26T09:00'], 'passed today → tomorrow')
assert.deepEqual(tq('오전 11시 30분 콜'), ['콜', '2026-09-25', '2026-09-25T11:30'])
assert.deepEqual(tq('14:30 리뷰'), ['리뷰', '2026-09-25', '2026-09-25T14:30'])
assert.deepEqual(tq('금요일 2시 반 점검'), ['점검', '2026-09-25', '2026-09-25T14:30'])
assert.deepEqual(tq('저녁 7시 운동'), ['운동', '2026-09-25', '2026-09-25T19:00'])
assert.deepEqual(tq('3시간 작업'), ['3시간 작업', null, null], 'not a time')
assert.deepEqual(tq('25시 편의점'), ['25시 편의점', null, null], 'impossible time')
assert.deepEqual(tq('1:1 미팅'), ['1:1 미팅', null, null])
assert.deepEqual(tq('05:35 알람'), ['알람', '2026-09-26', '2026-09-26T05:35'], 'leading zero = 24h clock, no afternoon guess')
assert.deepEqual(tq('3:30 콜'), ['콜', '2026-09-25', '2026-09-25T15:30'])
console.log('parseQuickInput time: all assertions passed')

// --- datetime-local round trip ------------------------------------------------
import { toDateTimeInput, fromDateTimeInput, formatReminder } from './format'
const localIso = new Date('2026-09-26T15:05:00').toISOString()
assert.equal(toDateTimeInput(localIso), '2026-09-26T15:05')
assert.equal(fromDateTimeInput('2026-09-26T15:05'), localIso)
assert.equal(fromDateTimeInput(''), null)
assert.equal(formatReminder(localIso), '9/26 15:05')
console.log('datetime input: all assertions passed')

// --- wiki links: [[title]] / [[title|alias]] -----------------------------------
import { extractLinks, renameLinks, normalizeTitle } from '@shared/links'

assert.deepEqual(
  extractLinks('참고: [[광고 소재 A/B 테스트]] 와 [[주간 보고|보고서]], 그리고 [[ 공백 ]]').map((l) => [l.target, l.alias]),
  [
    ['광고 소재 A/B 테스트', null],
    ['주간 보고', '보고서'],
    ['공백', null]
  ]
)
assert.deepEqual(extractLinks('[[]] [[a\nb]] [not] [[x]'), [], 'empty / multi-line / unclosed are not links')
assert.equal(normalizeTitle('  Weekly Report '), 'weekly report')
assert.equal(
  renameLinks('[[주간 보고]] · [[주간 보고|보고서]] · [[주간 보고서]] · [[ 주간 보고 ]]', '주간 보고', '주간 리포트'),
  '[[주간 리포트]] · [[주간 리포트|보고서]] · [[주간 보고서]] · [[주간 리포트]]',
  'only exact targets (case/space-insensitive) are renamed; aliases kept'
)
assert.equal(renameLinks('[[A.B*]]', 'a.b*', 'c'), '[[c]]', 'regex characters in titles are literal')
console.log('wiki links: all assertions passed')

// --- forceLayout: linked notes settle together, nothing explodes --------------
import { createLayout, tickLayout } from './forceLayout'

// 0–1–2 form a chain; 3 and 4 are loners.
const layout = createLayout(5, [
  [0, 1],
  [1, 2]
])
let energy = Infinity
for (let i = 0; i < 400; i++) energy = tickLayout(layout)
const dist = (i: number, j: number): number =>
  Math.hypot(layout.x[i] - layout.x[j], layout.y[i] - layout.y[j])
assert.ok([...layout.x, ...layout.y].every(Number.isFinite), 'no NaN / Infinity')
assert.ok(dist(0, 1) < dist(3, 4), 'linked nodes sit closer than unrelated ones')
assert.ok(energy < 0.05, `settles (energy ${energy})`)
assert.ok(Math.max(...layout.x.map(Math.abs), ...layout.y.map(Math.abs)) < 1000, 'stays near the centre')
// A pinned node (being dragged) doesn't move.
layout.pinned[3] = true
const before = [layout.x[3], layout.y[3]]
tickLayout(layout)
assert.deepEqual([layout.x[3], layout.y[3]], before)
console.log('forceLayout: all assertions passed')

// Links inside code are examples, not links (Obsidian ignores them too).
const codeNote = '`[[예시]]` 는 코드, [[진짜]] 는 링크\n```\n[[블록 안]]\n```\n끝 [[또 진짜]]'
assert.deepEqual(
  extractLinks(codeNote).map((l) => codeNote.slice(l.index, l.index + l.length)),
  ['[[진짜]]', '[[또 진짜]]'],
  'code spans / fences skipped; offsets still index the original text'
)
console.log('wiki links in code: all assertions passed')

// --- calendar events → local days (multi-day events land on every day) --------
import { eventDayKeys, formatEventTime } from './format'

const ev = (start: string, end: string, all_day: boolean) => ({ start: new Date(start).toISOString(), end: new Date(end).toISOString(), all_day })
assert.deepEqual(eventDayKeys(ev('2026-09-30T00:00:00', '2026-10-02T00:00:00', true)), ['2026-09-30', '2026-10-01'], 'end is exclusive')
assert.deepEqual(eventDayKeys(ev('2026-09-29T23:00:00', '2026-09-30T01:00:00', false)), ['2026-09-29', '2026-09-30'], 'crosses midnight')
assert.deepEqual(eventDayKeys(ev('2026-09-29T10:00:00', '2026-09-29T10:00:00', false)), ['2026-09-29'], 'zero-length')
assert.equal(formatEventTime(ev('2026-09-29T09:05:00', '2026-09-29T10:30:00', false)), '09:05–10:30')
assert.equal(formatEventTime(ev('2026-09-30T00:00:00', '2026-10-01T00:00:00', true)), '종일')
console.log('calendar event days: all assertions passed')

// --- lossless memo storage: blocks JSON beside the Markdown -------------------
import { serializeNoteDoc, resolveInitial, mapDocText, uncheckDoc, parseNoteDoc } from '@shared/noteDoc'
import { sanitizePageMeta } from '@shared/pageMeta'

const blocks = [
  { type: 'paragraph', props: { textColor: 'red' }, content: [{ type: 'text', text: '빨간 [[옛 제목]]', styles: {} }], children: [] },
  {
    type: 'toggleListItem',
    props: {},
    content: [{ type: 'link', href: 'https://x', content: [{ type: 'text', text: '[[옛 제목]] 링크', styles: {} }] }],
    children: [{ type: 'checkListItem', props: { checked: true }, content: [{ type: 'text', text: '완료', styles: {} }], children: [] }]
  },
  { type: 'table', props: {}, content: { type: 'tableContent', rows: [{ cells: [{ type: 'tableCell', content: [{ type: 'text', text: '[[옛 제목]]', styles: {} }] }] }] }, children: [] }
]
const md = '빨간 [[옛 제목]]\n\n* [[옛 제목]] 링크'
const docJson = serializeNoteDoc(md, blocks)

assert.deepEqual(resolveInitial(md, docJson).blocks, blocks, 'unchanged note → the lossless blocks')
assert.equal(resolveInitial(md, docJson).append, '')
const appended = resolveInitial(`${md}\n\n## Claude가 덧붙임`, docJson)
assert.deepEqual(appended.blocks, blocks, 'appended outside the editor (MCP) → keep blocks…')
assert.equal(appended.append, '## Claude가 덧붙임', '…and parse only the addition')
assert.equal(resolveInitial('완전히 다른 내용', docJson).blocks, null, 'rewritten elsewhere → Markdown wins')
assert.equal(resolveInitial(md, null).blocks, null)
assert.equal(resolveInitial(md, '{broken').blocks, null)
assert.equal(resolveInitial('', serializeNoteDoc('', [])).blocks?.length, 0)

const renamed = mapDocText(parseNoteDoc(docJson)!, (t) => t.split('[[옛 제목]]').join('[[새 제목]]'))
const flat = JSON.stringify(renamed.blocks)
assert.ok(!flat.includes('옛 제목') && flat.split('새 제목').length === 4, 'text in paragraphs, links, nested children and tables')
assert.equal(JSON.stringify(blocks).includes('새 제목'), false, 'input not mutated')
const unchecked = JSON.stringify(uncheckDoc(parseNoteDoc(docJson)!).blocks)
assert.ok(unchecked.includes('"checked":false') && !unchecked.includes('"checked":true'))

// --- page meta (cover / icon / layout) is validated wherever it's written -----
assert.deepEqual(sanitizePageMeta({ icon: '🚀', cover: 'gradient:3', coverPos: 140, fullWidth: true, font: 'serif', evil: 1 }), {
  icon: '🚀',
  cover: 'gradient:3',
  coverPos: 100,
  fullWidth: true,
  font: 'serif'
})
assert.deepEqual(sanitizePageMeta({ cover: 'image:https://images.example.com/a.jpg' }), { cover: 'image:https://images.example.com/a.jpg' })
assert.deepEqual(sanitizePageMeta({ cover: 'image:aop-file:///c1.png' }), { cover: 'image:aop-file:///c1.png' })
assert.deepEqual(sanitizePageMeta({ cover: 'image:javascript:alert(1)' }), {}, 'only https / attachment images')
assert.deepEqual(sanitizePageMeta({ cover: 'image:https://x.com/a.jpg") ; background:url(evil' }), {}, 'no CSS breakout')
assert.deepEqual(sanitizePageMeta({ font: 'comic' }), {})
assert.deepEqual(sanitizePageMeta('nope'), {})
console.log('note doc + page meta: all assertions passed')

// --- database views: filter / sort / group over tasks + custom properties -----
import { applyView, defaultViewConfig, parseViewConfig } from './database'
import type { DatabaseData, TaskWithContext } from '@shared/types'

const row = (id: string, over: Partial<TaskWithContext>): TaskWithContext =>
  ({ id, title: id, status: 'todo', priority: 0, due_date: null, category_id: 'c1', category_name: '백로그', updated_at: '2026-09-01', ...over }) as TaskWithContext
const dbData: DatabaseData = {
  tasks: [
    row('로그인', { priority: 3, due_date: new Date('2026-10-01T00:00:00').toISOString() }),
    row('결제', { status: 'doing', priority: 1 }),
    row('문서화', { status: 'done', category_id: 'c2', category_name: '문서' }),
    row('성능', { priority: 2, due_date: new Date('2026-09-28T00:00:00').toISOString() })
  ],
  properties: [
    { id: 'pts', workspace_id: 'w', name: '포인트', type: 'number', options: [], sort_order: 0 },
    { id: 'area', workspace_id: 'w', name: '영역', type: 'select', options: [{ name: 'FE', color: 'blue' }, { name: 'BE', color: 'green' }], sort_order: 1 },
    { id: 'tags', workspace_id: 'w', name: '태그', type: 'multi_select', options: [], sort_order: 2 }
  ],
  values: { 로그인: { pts: 5, area: 'FE', tags: ['긴급'] }, 결제: { pts: 8, area: 'BE' }, 성능: { pts: 3, area: 'FE', tags: ['긴급', '성능'] } }
}
const titles = (cfg: Parameters<typeof applyView>[1]): string[] => applyView(dbData, cfg).rows.map((r) => r.title)
const base = defaultViewConfig('w', null)

assert.deepEqual(titles(base), ['로그인', '결제', '문서화', '성능'], 'default: everything, manual order')
assert.deepEqual(titles({ ...base, categoryId: 'c2' }), ['문서화'])
assert.deepEqual(titles({ ...base, filters: [{ field: 'status', op: 'is_not', value: 'done' }] }), ['로그인', '결제', '성능'])
assert.deepEqual(titles({ ...base, filters: [{ field: 'prop:area', op: 'is', value: 'FE' }] }), ['로그인', '성능'])
assert.deepEqual(titles({ ...base, filters: [{ field: 'prop:tags', op: 'contains', value: '긴급' }] }), ['로그인', '성능'], 'multi-select contains')
assert.deepEqual(titles({ ...base, filters: [{ field: 'prop:pts', op: 'empty' }] }), ['문서화'])
assert.deepEqual(titles({ ...base, filters: [{ field: 'title', op: 'contains', value: '로그' }] }), ['로그인'])
assert.deepEqual(titles({ ...base, filters: [{ field: 'due', op: 'before', value: '2026-09-30' }] }), ['성능'])
assert.deepEqual(titles({ ...base, sort: { field: 'prop:pts', dir: 'desc' } }), ['결제', '로그인', '성능', '문서화'], 'empty values sort last')
assert.deepEqual(titles({ ...base, sort: { field: 'priority', dir: 'desc' } }), ['로그인', '성능', '결제', '문서화'])
assert.deepEqual(titles({ ...base, sort: { field: 'due', dir: 'asc' } }), ['성능', '로그인', '결제', '문서화'])

const byStatus = applyView(dbData, { ...base, groupBy: 'status' }).groups?.map((g) => [g.label, g.rows.map((r) => r.title)])
assert.deepEqual(byStatus, [
  ['할 일', ['로그인', '성능']],
  ['진행 중', ['결제']],
  ['완료', ['문서화']]
])
const byArea = applyView(dbData, { ...base, groupBy: 'prop:area' }).groups?.map((g) => [g.label, g.rows.length])
assert.deepEqual(byArea, [
  ['FE', 2],
  ['BE', 1],
  ['비어 있음', 1]
], 'select groups follow option order; empties last')

// Stored configs are untrusted JSON (they live in the memo's block props).
assert.deepEqual(parseViewConfig('{"workspaceId":"w","view":"hack","filters":[{"field":"x","op":"drop"}],"hidden":"x"}'), {
  ...defaultViewConfig('w', null),
  filters: []
})
assert.equal(parseViewConfig('not json'), null)
console.log('database views: all assertions passed')
