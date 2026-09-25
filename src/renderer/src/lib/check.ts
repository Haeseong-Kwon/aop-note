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
