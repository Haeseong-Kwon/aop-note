import assert from 'node:assert'
import { workspaceRepo } from './workspace.repo'
import { categoryRepo } from './category.repo'
import { taskRepo } from './task.repo'
import { trashRepo } from './trash.repo'
import { propertyRepo } from './property.repo'
import { getDb } from '../db'
import { pathForStored } from '../attachmentPaths'
import { existsSync, writeFileSync } from 'node:fs'

// Deletes stamp rows with a millisecond ISO time; keep separate deletes apart.
function tick(): void {
  const end = Date.now() + 3
  while (Date.now() < end) {
    /* spin */
  }
}

const ws = workspaceRepo.create({ name: '마케팅' })
const cat = categoryRepo.create({ workspace_id: ws.id, name: '캠페인' })
const child = categoryRepo.create({ workspace_id: ws.id, name: '블로그', parent_id: cat.id })
const t1 = taskRepo.create({ category_id: cat.id, title: '기획안' })
const t2 = taskRepo.create({ category_id: child.id, title: '초안' })
const loose = taskRepo.create({ category_id: cat.id, title: '따로 지운 작업' })

// 1. A single task delete shows up as one trash entry and restores cleanly.
taskRepo.remove(loose.id)
tick()
let items = trashRepo.list()
assert.deepEqual(items.map((i) => [i.kind, i.id]), [['task', loose.id]])
assert.equal(items[0].context, '마케팅 / 캠페인')
trashRepo.restore('task', loose.id)
assert.equal(trashRepo.list().length, 0)
assert.ok(taskRepo.getById(loose.id))

// 2. Deleting a category cascades, but the trash lists only the category itself.
taskRepo.remove(loose.id) // deleted earlier, in its own batch
tick()
categoryRepo.remove(cat.id)
tick()
items = trashRepo.list()
assert.deepEqual(
  items.map((i) => [i.kind, i.id]),
  [
    ['category', cat.id],
    ['task', loose.id]
  ],
  'newest first; cascaded child category and tasks are folded into the category entry'
)
assert.equal(items[0].task_count, 2)

// Restoring the category brings back its batch (child + t1 + t2) but not the
// task that was deleted separately before it.
trashRepo.restore('category', cat.id)
assert.ok(categoryRepo.getById(child.id))
assert.ok(taskRepo.getById(t1.id))
assert.ok(taskRepo.getById(t2.id))
assert.equal(taskRepo.getById(loose.id), undefined)

// 3. Restoring a task whose desk was deleted afterwards also restores the
//    desk's whole batch — otherwise the task would come back invisible.
tick()
workspaceRepo.remove(ws.id)
items = trashRepo.list()
assert.deepEqual(
  items.map((i) => i.kind),
  ['workspace', 'task']
)
assert.equal(items[0].task_count, 2, 't1 + t2 went with the desk; loose was already gone')
trashRepo.restore('task', loose.id)
for (const id of [t1.id, t2.id, loose.id]) assert.ok(taskRepo.getById(id))
assert.ok(workspaceRepo.getById(ws.id))
assert.ok(categoryRepo.getById(child.id))
assert.equal(trashRepo.list().length, 0)

// 4. Unknown ids / kinds fail loudly (kind comes from the renderer and is interpolated as a table name).
assert.throws(() => trashRepo.restore('constructor' as never, loose.id), /알 수 없는/)
assert.throws(() => trashRepo.restore('task', 'nope'), /휴지통/)

// 5. Emptying the trash hard-deletes every trashed row (and what hangs off it), leaves live data alone.
const keep = taskRepo.create({ category_id: child.id, title: '남길 작업' })
const doomedWs = workspaceRepo.create({ name: '버릴 데스크' })
const doomedCat = categoryRepo.create({ workspace_id: doomedWs.id, name: '버릴 카테고리' })
const doomedChild = categoryRepo.create({ workspace_id: doomedWs.id, name: '하위', parent_id: doomedCat.id })
const inDesk = taskRepo.create({ category_id: doomedChild.id, title: '데스크와 함께' })
const prop = propertyRepo.create({ workspace_id: doomedWs.id, name: '단계', type: 'text' })
propertyRepo.setValue(inDesk.id, prop.id, '초안')
const db = getDb()
db.prepare(
  "INSERT INTO attachments (id, task_id, file_name, stored_name, created_at, updated_at) VALUES ('att1', ?, 'a.txt', 'purge-test.txt', '', '')"
).run(inDesk.id)
writeFileSync(pathForStored('purge-test.txt'), 'x')
tick()
taskRepo.remove(loose.id)
tick()
workspaceRepo.remove(doomedWs.id)
assert.equal(trashRepo.list().length, 2)
assert.equal(trashRepo.empty(), 2)
assert.equal(trashRepo.list().length, 0)
for (const [table, id] of [
  ['tasks', loose.id],
  ['tasks', inDesk.id],
  ['categories', doomedChild.id],
  ['workspaces', doomedWs.id],
  ['properties', prop.id],
  ['attachments', 'att1']
]) assert.equal(db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id), undefined, `${table} ${id} purged`)
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM task_values WHERE task_id = ?').pluck().get(inDesk.id), 0)
assert.ok(!existsSync(pathForStored('purge-test.txt')), 'attachment file removed')
assert.ok(taskRepo.getById(keep.id))
assert.ok(workspaceRepo.getById(ws.id))
assert.equal(trashRepo.empty(), 0)

console.log('trash: all assertions passed')
