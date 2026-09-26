import assert from 'node:assert'
import { workspaceRepo } from './workspace.repo'
import { categoryRepo } from './category.repo'
import { taskRepo } from './task.repo'
import { syncedRepo } from './synced.repo'
import { serializeNoteDoc, parseNoteDoc } from '@shared/noteDoc'

const shared = syncedRepo.create()
assert.equal(parseNoteDoc(syncedRepo.get(shared.id)?.doc)?.md, '', 'starts empty')

const blocks = [{ type: 'paragraph', props: {}, content: [{ type: 'text', text: '공통 배포 절차', styles: {} }], children: [] }]
syncedRepo.save(shared.id, '공통 배포 절차', blocks)
assert.deepEqual(parseNoteDoc(syncedRepo.get(shared.id)?.doc)?.blocks, blocks)
assert.throws(() => syncedRepo.save('nope', 'x', []), /동기화 블록/)

// Usage = memos whose saved blocks reference it; the list shows a preview.
const ws = workspaceRepo.create({ name: '동기화' })
const cat = categoryRepo.create({ workspace_id: ws.id, name: '문서' })
const ref = (id: string): unknown[] => [{ type: 'synced', props: { syncId: id, cachedMd: '' }, children: [] }]
for (const title of ['A 서비스 런북', 'B 서비스 런북']) {
  const t = taskRepo.create({ category_id: cat.id, title })
  taskRepo.update({ id: t.id, note: '', note_doc: serializeNoteDoc('', ref(shared.id)) })
}
const other = syncedRepo.create()
const listed = syncedRepo.list()
const mine = listed.find((s) => s.id === shared.id)
assert.equal(mine?.preview, '공통 배포 절차')
assert.equal(mine?.used_in, 2)
assert.equal(listed.find((s) => s.id === other.id)?.used_in, 0)
assert.equal(listed[0].id, other.id, 'most recently changed first')

console.log('synced blocks: all assertions passed')
