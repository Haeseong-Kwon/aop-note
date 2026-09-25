import assert from 'node:assert'
import { workspaceRepo } from './workspace.repo'
import { categoryRepo } from './category.repo'
import { taskRepo } from './task.repo'
import { nextOccurrence } from './recurrence'

// --- nextOccurrence: pure date math (local dates, YYYY-MM-DD) ---
const d = (s: string): Date => new Date(`${s}T00:00:00`)
const ymd = (x: Date): string =>
  `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
const next = (due: string, rule: Parameters<typeof nextOccurrence>[1], today = due): string =>
  ymd(nextOccurrence(d(due), rule, d(today)))

assert.equal(next('2026-09-25', 'daily'), '2026-09-26')
assert.equal(next('2026-09-25', 'weekdays'), '2026-09-28', 'Fri → Mon')
assert.equal(next('2026-09-28', 'weekdays'), '2026-09-29')
assert.equal(next('2026-09-25', 'weekly'), '2026-10-02')
assert.equal(next('2026-01-31', 'monthly'), '2026-02-28', 'clamped to month end')
assert.equal(next('2026-02-28', 'monthly'), '2026-03-28')
// Completed late: skip the missed occurrences instead of piling up overdue copies.
assert.equal(next('2026-09-20', 'daily', '2026-09-25'), '2026-09-25')
assert.equal(next('2026-09-01', 'weekly', '2026-09-25'), '2026-09-29')
assert.equal(next('2026-08-25', 'monthly', '2026-09-27'), '2026-10-25')

// --- completing a recurring task schedules the next one ---
const ws = workspaceRepo.create({ name: '반복' })
const cat = categoryRepo.create({ workspace_id: ws.id, name: '루틴' })
const due = d('2099-01-05').toISOString() // a Monday, safely in the future
const weekly = taskRepo.create({
  category_id: cat.id,
  title: '주간 보고',
  note: '- [x] 지표 정리\n- [X] 공유',
  priority: 2,
  due_date: due,
  recurrence: 'weekly'
})
assert.equal(weekly.recurrence, 'weekly')

const liveTitled = (title: string) => taskRepo.listByCategory(cat.id).filter((t) => t.title === title)

taskRepo.setStatus(weekly.id, 'done')
let copies = liveTitled('주간 보고').filter((t) => t.status === 'todo')
assert.equal(copies.length, 1, 'one next occurrence')
const spawned = copies[0]
assert.equal(ymd(new Date(spawned.due_date as string)), '2099-01-12')
assert.equal(spawned.recurrence, 'weekly')
assert.equal(spawned.priority, 2)
assert.equal(spawned.note, '- [ ] 지표 정리\n- [ ] 공유', 'checklist reset for the next round')

// Un-completing and completing again must not create a duplicate.
taskRepo.setStatus(weekly.id, 'todo')
taskRepo.setStatus(weekly.id, 'done')
copies = liveTitled('주간 보고').filter((t) => t.status === 'todo')
assert.equal(copies.length, 1, 'no duplicate after re-completing')

// Plain tasks and edits that don't complete a task spawn nothing.
const plain = taskRepo.create({ category_id: cat.id, title: '일회성', due_date: due })
taskRepo.setStatus(plain.id, 'done')
assert.equal(liveTitled('일회성').length, 1)
taskRepo.update({ id: spawned.id, title: '주간 보고' })
assert.equal(liveTitled('주간 보고').length, 2)

// A recurring task without a due date starts counting from today.
const noDue = taskRepo.create({ category_id: cat.id, title: '물 마시기', recurrence: 'daily' })
taskRepo.setStatus(noDue.id, 'done')
const tomorrow = new Date()
tomorrow.setDate(tomorrow.getDate() + 1)
const nextWater = liveTitled('물 마시기').find((t) => t.status === 'todo')
assert.equal(ymd(new Date(nextWater?.due_date as string)), ymd(tomorrow))

// Recurrence can be cleared.
assert.equal(taskRepo.update({ id: spawned.id, recurrence: null }).recurrence, null)

console.log('recurrence: all assertions passed')
