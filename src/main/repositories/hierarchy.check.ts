import assert from 'node:assert'
import { workspaceRepo } from './workspace.repo'
import { categoryRepo } from './category.repo'
import { taskRepo } from './task.repo'
import { trashRepo } from './trash.repo'
import { getDb } from '../db'

// Deletes stamp rows with a millisecond ISO time; keep separate deletes apart.
function tick(): void {
  const end = Date.now() + 3
  while (Date.now() < end) {
    /* spin */
  }
}

const ws = workspaceRepo.create({ name: '계층 데스크' })

// ---- Folders nest to any depth -------------------------------------------------
const a = categoryRepo.create({ workspace_id: ws.id, name: 'A' })
const b = categoryRepo.create({ workspace_id: ws.id, name: 'B', parent_id: a.id })
const c = categoryRepo.create({ workspace_id: ws.id, name: 'C', parent_id: b.id })
const inC = taskRepo.create({ category_id: c.id, title: 'C 안의 메모' })

assert.throws(() => categoryRepo.update({ id: a.id, parent_id: c.id }), /하위/, 'no folder cycles')
assert.throws(() => categoryRepo.update({ id: a.id, parent_id: a.id }), /하위/, 'not its own parent')

assert.deepEqual(
  taskRepo.listCategoryPaths().find((r) => r.id === c.id)?.parents,
  ['A', 'B'],
  'full ancestor path for the vault mirror'
)

categoryRepo.remove(a.id)
assert.equal(categoryRepo.getById(c.id), undefined, 'grandchild folder deleted with the root')
assert.equal(taskRepo.getById(inC.id), undefined, 'and its memos')
let items = trashRepo.list().filter((i) => i.context.startsWith('계층'))
assert.deepEqual(items.map((i) => [i.kind, i.id]), [['category', a.id]], 'only the root folder is listed')
assert.equal(items[0].task_count, 1)
trashRepo.restore('category', a.id)
assert.ok(categoryRepo.getById(c.id) && taskRepo.getById(inC.id), 'restore brings back the whole subtree')

// ---- Sub-memos ------------------------------------------------------------------
const other = categoryRepo.create({ workspace_id: ws.id, name: '다른 폴더' })
const p = taskRepo.create({ category_id: a.id, title: '부모 메모' })
const k = taskRepo.create({ category_id: other.id, parent_id: p.id, title: '자식 메모' })
const g = taskRepo.create({ category_id: a.id, parent_id: k.id, title: '손자 메모' })
assert.equal(k.parent_id, p.id)
assert.equal(k.category_id, a.id, 'a sub-memo lives in its parent’s folder')
assert.equal(p.parent_id, null)
assert.throws(() => taskRepo.create({ category_id: a.id, parent_id: 'nope', title: 'x' }), /상위 메모/)

// Deleting a memo takes its sub-memos; the trash lists just the top one.
tick()
taskRepo.remove(p.id)
assert.equal(taskRepo.getById(g.id), undefined)
items = trashRepo.list().filter((i) => i.context.startsWith('계층'))
assert.deepEqual(items.map((i) => [i.kind, i.id]), [['task', p.id]])
assert.equal(items[0].task_count, 3)
trashRepo.restore('task', p.id)
assert.ok(taskRepo.getById(k.id) && taskRepo.getById(g.id))

// Restoring a sub-memo deleted on its own also restores a parent deleted later.
tick()
taskRepo.remove(g.id)
tick()
taskRepo.remove(p.id)
trashRepo.restore('task', g.id)
assert.ok(taskRepo.getById(p.id) && taskRepo.getById(k.id) && taskRepo.getById(g.id))

// Moving a memo moves its sub-memos; moving a sub-memo alone detaches it.
taskRepo.update({ id: p.id, category_id: other.id })
assert.equal(taskRepo.getById(g.id)?.category_id, other.id)
taskRepo.update({ id: k.id, category_id: a.id })
assert.equal(taskRepo.getById(k.id)?.parent_id, null, 'moved out of its parent’s folder → top level')
assert.equal(taskRepo.getById(g.id)?.parent_id, k.id, 'but keeps its own children')
assert.equal(taskRepo.getById(g.id)?.category_id, a.id)

// Duplicating a sub-memo keeps it next to the original.
assert.equal(taskRepo.duplicate(g.id).parent_id, k.id)

// Emptying the trash purges sub-memos without tripping the parent_id foreign key.
tick()
taskRepo.remove(k.id)
trashRepo.empty()
assert.equal(getDb().prepare('SELECT 1 FROM tasks WHERE id = ?').get(g.id), undefined)

// ---- Sub-desks ------------------------------------------------------------------
const parentDesk = workspaceRepo.create({ name: '회사' })
const subDesk = workspaceRepo.create({ name: '마케팅팀', parent_id: parentDesk.id })
const subSub = workspaceRepo.create({ name: '캠페인', parent_id: subDesk.id })
assert.equal(subDesk.parent_id, parentDesk.id)
assert.equal(workspaceRepo.getById(subSub.id)?.parent_id, subDesk.id)
assert.equal(workspaceRepo.create({ name: '최상위' }).parent_id, null)
assert.throws(() => workspaceRepo.create({ name: 'x', parent_id: 'nope' }), /상위 데스크/)
// Deleting a desk never takes its sub-desks along: they move up one level.
workspaceRepo.remove(subDesk.id)
assert.equal(workspaceRepo.getById(subSub.id)?.parent_id, parentDesk.id)

console.log('hierarchy: all assertions passed')
