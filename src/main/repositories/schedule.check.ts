import assert from 'node:assert'
import { workspaceRepo } from './workspace.repo'
import { scheduleRepo } from './schedule.repo'
import { trashRepo } from './trash.repo'

const desk = workspaceRepo.create({ name: '일정 데스크' })
const other = workspaceRepo.create({ name: '다른 데스크' })

// All-day, several days: dates only (no timezone drift), end inclusive.
const trip = scheduleRepo.create({ workspace_id: desk.id, title: ' 부산 출장 ', all_day: true, start: '2026-10-01', end: '2026-10-03', color: '#3b82f6' })
assert.equal(trip.title, '부산 출장')
assert.equal(trip.start_day, '2026-10-01')
assert.equal(trip.end_day, '2026-10-03')

// Timed: ISO datetimes; its days come from local time.
const start = new Date(2026, 9, 2, 14, 0).toISOString()
const end = new Date(2026, 9, 2, 15, 30).toISOString()
const meeting = scheduleRepo.create({ workspace_id: desk.id, title: '고객 미팅', all_day: false, start, end, location: '강남' })
assert.equal(meeting.start_day, '2026-10-02')
assert.equal(meeting.color, '#6366f1', 'default colour')
scheduleRepo.create({ workspace_id: other.id, title: '남의 일정', all_day: true, start: '2026-10-02', end: '2026-10-02' })

// Overlap query per desk: anything touching [from, to].
const ids = (from: string, to: string): string[] => scheduleRepo.listBetween(from, to, desk.id).map((s) => s.id).sort()
assert.deepEqual(ids('2026-10-03', '2026-10-10'), [trip.id], 'a trip ending on the 3rd still shows that week')
assert.deepEqual(ids('2026-09-01', '2026-09-30'), [])
assert.deepEqual(ids('2026-10-02', '2026-10-02'), [meeting.id, trip.id].sort())
assert.equal(scheduleRepo.listBetween('2026-10-01', '2026-10-31', null).length, 3, 'null = every desk')

// Validation at the boundary.
assert.throws(() => scheduleRepo.create({ workspace_id: desk.id, title: '  ', all_day: true, start: '2026-10-01', end: '2026-10-01' }), /제목/)
assert.throws(() => scheduleRepo.create({ workspace_id: desk.id, title: 'x', all_day: true, start: '2026-10-05', end: '2026-10-01' }), /종료/)
assert.throws(() => scheduleRepo.create({ workspace_id: desk.id, title: 'x', all_day: true, start: '10/1', end: '2026-10-01' }), /날짜/)
assert.throws(() => scheduleRepo.create({ workspace_id: desk.id, title: 'x', all_day: false, start, end: start }), /종료/)
assert.throws(() => scheduleRepo.create({ workspace_id: desk.id, title: 'x', all_day: true, start: '2026-10-01', end: '2026-10-01', color: 'red;}' }), /색/)
assert.throws(() => scheduleRepo.create({ workspace_id: 'nope', title: 'x', all_day: true, start: '2026-10-01', end: '2026-10-01' }), /데스크/)

// Update: extend the trip, switch to timed; delete + undo.
const moved = scheduleRepo.update({ id: trip.id, end: '2026-10-04', note: '숙소 예약' })
assert.equal(moved.end_day, '2026-10-04')
assert.equal(moved.note, '숙소 예약')
assert.throws(() => scheduleRepo.update({ id: trip.id, start: '2026-10-09' }), /종료/, 'update keeps start ≤ end')
scheduleRepo.remove(meeting.id)
assert.deepEqual(ids('2026-10-02', '2026-10-02'), [trip.id])
scheduleRepo.restore(meeting.id)
assert.deepEqual(ids('2026-10-02', '2026-10-02'), [meeting.id, trip.id].sort())

// Emptying the trash after deleting the desk purges its schedules (no dangling desk reference).
workspaceRepo.remove(desk.id)
trashRepo.empty()
assert.equal(scheduleRepo.getById(trip.id), undefined)
assert.equal(scheduleRepo.listBetween('2026-10-01', '2026-10-31', null).length, 1, 'the other desk keeps its schedule')

console.log('schedules: all assertions passed')
