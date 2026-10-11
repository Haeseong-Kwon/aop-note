import assert from 'node:assert'
import { buildIcs, foldLine } from './icsExport'
import { parseIcs } from './ics'
import type { Schedule, TaskWithContext } from '@shared/types'

const base = { workspace_id: null, color: '#6366f1', created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-02T00:00:00.000Z', deleted_at: null }
const schedules: Schedule[] = [
  { ...base, id: 's1', title: '워크숍, 1일차; 준비', note: '줄1\n줄2', location: '회의실 A', all_day: true, start: '2026-10-20', end: '2026-10-21', start_day: '2026-10-20', end_day: '2026-10-21' },
  { ...base, id: 's2', title: '리뷰', note: '', location: '', all_day: false, start: '2026-10-22T01:00:00.000Z', end: '2026-10-22T02:30:00.000Z', start_day: '2026-10-22', end_day: '2026-10-22' }
] as Schedule[]
const tasks = [
  { id: 't1', title: '보고서 제출', due_date: '2026-10-23T09:00:00.000Z', status: 'todo', workspace_name: '회사', category_name: '업무' },
  { id: 't2', title: '끝난 일', due_date: '2026-10-23T09:00:00.000Z', status: 'done', workspace_name: '회사', category_name: '업무' }
] as TaskWithContext[]

const ics = buildIcs(schedules, tasks, new Date('2026-10-10T00:00:00.000Z'))
assert.ok(ics.split('\r\n').every((l) => Buffer.byteLength(l) <= 75), 'every line ≤ 75 octets')
assert.match(ics, /DTEND;VALUE=DATE:20261022/, 'all-day end is exclusive (inclusive 10-21 → 10-22)')
assert.ok(ics.includes('SUMMARY:워크숍\\, 1일차\\; 준비'), 'commas and semicolons escaped (RFC 5545)')
assert.ok(!ics.includes('끝난 일'), 'done tasks are left out')

// Round-trip through the app's own iCalendar parser (the one used for subscriptions).
const back = parseIcs(ics, new Date('2026-10-01T00:00:00.000Z'), new Date('2026-11-01T00:00:00.000Z'))
const titles = back.map((e) => e.title).sort()
assert.deepEqual(titles, ['[할 일] 보고서 제출', '리뷰', '워크숍, 1일차; 준비'].sort())
const review = back.find((e) => e.title === '리뷰')
assert.equal(review && new Date(review.start).toISOString(), '2026-10-22T01:00:00.000Z')
assert.equal(back.find((e) => e.title.startsWith('워크숍'))?.location, '회의실 A')

const long = foldLine(`SUMMARY:${'가'.repeat(60)}`)
assert.ok(long.split('\r\n ').every((l) => Buffer.byteLength(l) <= 75) && long.replace(/\r\n /g, '') === `SUMMARY:${'가'.repeat(60)}`, 'folding never splits a character')
console.log('ics export: all assertions passed')
