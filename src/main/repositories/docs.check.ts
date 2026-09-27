import assert from 'node:assert'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { workspaceRepo } from './workspace.repo'
import { categoryRepo } from './category.repo'
import { taskRepo } from './task.repo'
import { attachmentRepo } from './attachment.repo'
import { docFolderRepo } from './docFolder.repo'
import { trashRepo } from './trash.repo'
import { addAttachment, addDocument } from '../attachments'
import { attachmentsDir, pathForStored } from '../attachmentPaths'

mkdirSync(attachmentsDir(), { recursive: true })
const src = join(tmpdir(), `aop-doc-${Date.now()}.pdf`)
writeFileSync(src, 'pdf')

// A desk with no categories or memos still takes documents.
const ws = workspaceRepo.create({ name: '문서 데스크' })
const loose = addDocument(ws.id, null, src, '계약서.pdf')
assert.equal(loose.task_id, null)
assert.equal(loose.workspace_id, ws.id)
let docs = attachmentRepo.listByWorkspace(ws.id)
assert.deepEqual(docs.map((d) => d.id), [loose.id])
assert.equal(docs[0].task_title, null)

// Folders nest; documents and folders move between them.
const legal = docFolderRepo.create({ workspace_id: ws.id, name: '법무' })
const y2026 = docFolderRepo.create({ workspace_id: ws.id, name: '2026', parent_id: legal.id })
assert.throws(() => docFolderRepo.create({ workspace_id: ws.id, name: '  ' }), /이름/)
const inFolder = addDocument(ws.id, y2026.id, src, '견적서.pdf')
assert.equal(inFolder.folder_id, y2026.id)

attachmentRepo.move(loose.id, legal.id)
assert.equal(attachmentRepo.getById(loose.id)?.folder_id, legal.id)
attachmentRepo.move(loose.id, null)
assert.equal(attachmentRepo.getById(loose.id)?.folder_id, null, 'back to the top level')

assert.throws(() => docFolderRepo.move(legal.id, y2026.id), /하위/, 'no folder cycles')
const archive = docFolderRepo.create({ workspace_id: ws.id, name: '보관' })
docFolderRepo.move(y2026.id, archive.id)
assert.equal(docFolderRepo.list(ws.id).find((f) => f.id === y2026.id)?.parent_id, archive.id)
docFolderRepo.rename(archive.id, ' 보관함 ')
assert.equal(docFolderRepo.list(ws.id).find((f) => f.id === archive.id)?.name, '보관함')

// Other desks' folders are off limits.
const otherWs = workspaceRepo.create({ name: '다른 데스크' })
const foreign = docFolderRepo.create({ workspace_id: otherWs.id, name: '남의 폴더' })
assert.throws(() => attachmentRepo.move(loose.id, foreign.id), /폴더/)
assert.throws(() => docFolderRepo.move(legal.id, foreign.id), /폴더/)
assert.throws(() => addDocument(ws.id, foreign.id, src, 'x.pdf'), /폴더/)

// Deleting a folder keeps its contents: they move up one level.
docFolderRepo.remove(archive.id)
assert.equal(docFolderRepo.list(ws.id).find((f) => f.id === y2026.id)?.parent_id, null)
assert.equal(attachmentRepo.getById(inFolder.id)?.folder_id, y2026.id)
docFolderRepo.remove(y2026.id)
assert.equal(attachmentRepo.getById(inFolder.id)?.folder_id, null)

// Memo attachments still list (with their memo) and can be filed into folders too.
const cat = categoryRepo.create({ workspace_id: ws.id, name: '업무' })
const task = taskRepo.create({ category_id: cat.id, title: '미팅' })
const attached = addAttachment(task.id, src, '회의록.pdf')
attachmentRepo.move(attached.id, legal.id)
docs = attachmentRepo.listByWorkspace(ws.id)
assert.equal(docs.find((d) => d.id === attached.id)?.task_title, '미팅')
assert.equal(docs.find((d) => d.id === attached.id)?.folder_id, legal.id)
taskRepo.remove(task.id)
assert.ok(!attachmentRepo.listByWorkspace(ws.id).some((d) => d.id === attached.id), 'trashed memo hides its files')
trashRepo.restore('task', task.id)

// Emptying the trash after deleting the desk purges its loose documents and folders.
workspaceRepo.remove(ws.id)
trashRepo.empty()
assert.equal(attachmentRepo.getById(loose.id), undefined)
assert.ok(!existsSync(pathForStored(loose.stored_name)), 'file removed from disk')
assert.deepEqual(docFolderRepo.list(ws.id), [])
assert.equal(docFolderRepo.list(otherWs.id).length, 1, 'other desks untouched')

console.log('documents: all assertions passed')
