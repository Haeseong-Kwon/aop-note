import assert from 'node:assert'
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { workspaceRepo } from './repositories/workspace.repo'
import { categoryRepo } from './repositories/category.repo'
import { taskRepo } from './repositories/task.repo'
import { searchRepo } from './repositories/search.repo'
import { takeSnapshot, mergeSnapshot, syncNow, syncDir, type Snapshot } from './sync'
import { SCHEMA_VERSION } from './db/migrations'
import { attachmentsDir } from './attachmentPaths'
import { attachmentRepo } from './repositories/attachment.repo'

const ws = workspaceRepo.create({ name: '동기화 데스크' })
const linked = mkdtempSync(join(tmpdir(), 'aop-linked-'))
workspaceRepo.setFolder(ws.id, linked)
const cat = categoryRepo.create({ workspace_id: ws.id, name: '공유' })
const memo = taskRepo.create({ category_id: cat.id, title: '원본 제목', note: '' })

// Simulate the other device: it has the same rows plus its own edits.
const other = takeSnapshot('device-b', new Date())
assert.ok(!('folder_path' in other.tables.workspaces[0]), 'linked folder paths stay on their machine')
const later = '2999-01-01T00:00:00.000Z'
const tasks = other.tables.tasks.map((t) => (t.id === memo.id ? { ...t, title: '다른 기기에서 고침', updated_at: later } : t))
// A sub-memo listed before its parent (and a brand-new parent) must still merge.
tasks.unshift(
  { ...tasks[0], id: 'child-from-b', parent_id: 'parent-from-b', title: '자식', note: '', updated_at: later, created_at: later },
  { ...tasks[0], id: 'parent-from-b', parent_id: null, title: '새 부모 메모', note: '협업 퍼널 문서', updated_at: later, created_at: later }
)
const snap: Snapshot = { ...other, tables: { ...other.tables, tasks } }

const changed = mergeSnapshot(snap)
assert.ok(changed >= 3, `merged rows (${changed})`)
assert.equal(taskRepo.getById(memo.id)?.title, '다른 기기에서 고침', 'newer edit wins')
assert.equal(taskRepo.getById('child-from-b')?.parent_id, 'parent-from-b', 'child before parent is fine')
assert.equal(workspaceRepo.getById(ws.id)?.folder_path, linked, 'local folder link untouched')
assert.ok(searchRepo.notes('협업 퍼널').some((h) => h.id === 'parent-from-b'), 'merged memos are searchable')

// An older copy never overwrites a newer local edit; merging twice changes nothing.
const stale = { ...snap, tables: { ...snap.tables, tasks: snap.tables.tasks.map((t) => (t.id === memo.id ? { ...t, title: '옛날 제목', updated_at: '2000-01-01T00:00:00.000Z' } : t)) } }
mergeSnapshot(stale)
assert.equal(taskRepo.getById(memo.id)?.title, '다른 기기에서 고침', 'older edit ignored')
assert.equal(mergeSnapshot(snap), 0, 'idempotent')

// Deletes travel as soft deletes.
const deleted = { ...snap, tables: { ...snap.tables, tasks: snap.tables.tasks.map((t) => (t.id === 'child-from-b' ? { ...t, deleted_at: '2999-01-02T00:00:00.000Z', updated_at: '2999-01-02T00:00:00.000Z' } : t)) } }
mergeSnapshot(deleted)
assert.equal(taskRepo.getById('child-from-b'), undefined, 'deleted on the other device → trashed here')

assert.throws(() => mergeSnapshot({ ...snap, schema: SCHEMA_VERSION + 1 }), /더 새 버전/)

// Full round through a folder: our snapshot is published, the other device's is merged, files copied both ways.
const root = mkdtempSync(join(tmpdir(), 'aop-sync-'))
mkdirSync(join(syncDir(root), 'devices'), { recursive: true })
mkdirSync(join(syncDir(root), 'attachments'), { recursive: true })
const fileRow = (id: string, stored: string) => ({
  id, task_id: null, workspace_id: ws.id, folder_id: null, file_name: stored, ext: stored.split('.').pop(), mime: '', size: 3,
  stored_name: stored, created_at: later, updated_at: later, deleted_at: null
})
attachmentRepo.insert(fileRow('att-a', 'from-a.pdf') as never)
const withFile = { ...snap, tables: { ...snap.tables, attachments: [...snap.tables.attachments, fileRow('att-b', 'from-b.png')] } }
writeFileSync(join(syncDir(root), 'devices', 'device-b.json'), JSON.stringify(withFile))
writeFileSync(join(syncDir(root), 'attachments', 'stray.command'), '#!/bin/sh')
writeFileSync(join(syncDir(root), 'devices', 'broken.json'), '{"half": ')
writeFileSync(join(syncDir(root), 'attachments', 'from-b.png'), 'png')
mkdirSync(attachmentsDir(), { recursive: true })
writeFileSync(join(attachmentsDir(), 'from-a.pdf'), 'pdf')
const res = syncNow(root, 'device-a')
assert.equal(res.devices, 1, 'broken file skipped, good one merged')
assert.ok(existsSync(join(attachmentsDir(), 'from-b.png')) && existsSync(join(syncDir(root), 'attachments', 'from-a.pdf')), 'attachments both ways')
assert.ok(!existsSync(join(attachmentsDir(), 'stray.command')), 'files no attachment row references are never copied in')
const mine = JSON.parse(readFileSync(join(syncDir(root), 'devices', 'device-a.json'), 'utf8')) as Snapshot
assert.equal(mine.device, 'device-a')
assert.ok(mine.tables.tasks.some((t) => t.id === memo.id))
console.log('sync: all assertions passed')

// ---- Custom fields: property edits travel (LWW); a cell value follows its memo, so clears travel too ----
import { propertyRepo } from './repositories/property.repo'
{
  const later2 = '2999-02-01T00:00:00.000Z'
  const prop = propertyRepo.create({ workspace_id: ws.id, name: '상태값', type: 'text' })
  propertyRepo.setValue(memo.id, prop.id, '초안')
  const theirs = takeSnapshot('device-c')
  // On the other device: the property was renamed, and this memo's cell was cleared (a later memo edit).
  const props = theirs.tables.properties.map((p) => (p.id === prop.id ? { ...p, name: '진행 상태', updated_at: later2 } : p))
  const memos = theirs.tables.tasks.map((t) => (t.id === memo.id ? { ...t, updated_at: later2 } : t))
  const values = theirs.tables.task_values.filter((v) => !(v.task_id === memo.id && v.property_id === prop.id))
  mergeSnapshot({ ...theirs, tables: { ...theirs.tables, properties: props, tasks: memos, task_values: values } })
  assert.equal(propertyRepo.listByWorkspace(ws.id).find((p) => p.id === prop.id)?.name, '진행 상태', 'property rename travels')
  assert.equal(propertyRepo.valuesForWorkspace(ws.id)[memo.id]?.[prop.id], undefined, 'a cleared value stays cleared')
  // And an older memo copy never wipes newer local values.
  propertyRepo.setValue(memo.id, prop.id, '최신 값')
  mergeSnapshot({ ...theirs, tables: { ...theirs.tables, task_values: [] } })
  assert.equal(propertyRepo.valuesForWorkspace(ws.id)[memo.id]?.[prop.id], '최신 값')
}

// ---- Concurrent moves that form a cycle (X under Y here, Y under X there) are repaired ----
{
  const x = workspaceRepo.create({ name: '사이클 X' })
  const y = workspaceRepo.create({ name: '사이클 Y' })
  workspaceRepo.update({ id: x.id, parent_id: y.id })
  const theirs = takeSnapshot('device-d')
  const rows = theirs.tables.workspaces.map((w) =>
    w.id === y.id ? { ...w, parent_id: x.id, updated_at: '2999-03-01T00:00:00.000Z' } : w
  )
  mergeSnapshot({ ...theirs, tables: { ...theirs.tables, workspaces: rows } })
  const a = workspaceRepo.getById(x.id)!
  const b = workspaceRepo.getById(y.id)!
  assert.ok(!(a.parent_id === b.id && b.parent_id === a.id), 'no desk cycle after merge')
  assert.ok(a.parent_id === null || b.parent_id === null, 'one of them is lifted to the top level')
  console.log('sync (fields, cycles): all assertions passed')
}
