import assert from 'node:assert'
import { workspaceRepo } from './workspace.repo'
import { categoryRepo } from './category.repo'
import { taskRepo } from './task.repo'

const ws = workspaceRepo.create({ name: '알림' })
const cat = categoryRepo.create({ workspace_id: ws.id, name: '일정' })
const at = (s: string): string => new Date(s).toISOString()

const call = taskRepo.create({ category_id: cat.id, title: '고객 통화', remind_at: at('2026-09-26T15:00:00') })
taskRepo.create({ category_id: cat.id, title: '나중 일', remind_at: at('2026-09-26T18:00:00') })
const done = taskRepo.create({ category_id: cat.id, title: '끝난 일', remind_at: at('2026-09-26T09:00:00') })
taskRepo.setStatus(done.id, 'done')

const dueAt = (now: string): string[] => taskRepo.listRemindersDue(at(now)).map((t) => t.title)

assert.deepEqual(dueAt('2026-09-26T14:59:00'), [], 'not yet')
assert.deepEqual(dueAt('2026-09-26T15:00:30'), ['고객 통화'], 'due now; done tasks never remind')
taskRepo.markReminded(call.id)
assert.deepEqual(dueAt('2026-09-26T15:05:00'), [], 'fires once')

// Moving the reminder re-arms it.
taskRepo.update({ id: call.id, remind_at: at('2026-09-26T16:00:00') })
assert.deepEqual(dueAt('2026-09-26T16:00:00'), ['고객 통화'])
// Editing something else keeps it armed/disarmed as it was.
taskRepo.markReminded(call.id)
taskRepo.update({ id: call.id, title: '고객 통화 (재)' })
assert.deepEqual(dueAt('2026-09-26T16:30:00'), [])

// A repeating task carries its reminder time into the next occurrence.
const daily = taskRepo.create({
  category_id: cat.id,
  title: '일일 점검',
  due_date: at('2099-03-10T00:00:00'),
  remind_at: at('2099-03-10T09:30:00'),
  recurrence: 'daily'
})
taskRepo.setStatus(daily.id, 'done')
const next = taskRepo.listByCategory(cat.id).find((t) => t.title === '일일 점검' && t.status === 'todo')
assert.equal(next?.remind_at, at('2099-03-11T09:30:00'))

console.log('reminders: all assertions passed')
