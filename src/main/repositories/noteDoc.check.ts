import assert from 'node:assert'
import { workspaceRepo } from './workspace.repo'
import { categoryRepo } from './category.repo'
import { taskRepo } from './task.repo'
import { serializeNoteDoc, parseNoteDoc, resolveInitial } from '@shared/noteDoc'
import { parsePageMeta } from '@shared/pageMeta'

const ws = workspaceRepo.create({ name: '노션식 메모' })
const cat = categoryRepo.create({ workspace_id: ws.id, name: '문서' })
const target = taskRepo.create({ category_id: cat.id, title: '설계안' })

const md = '[[설계안]] 참고\n\n* [x] 확인'
const blocks = [
  { type: 'callout', props: { emoji: '💡' }, content: [{ type: 'text', text: '[[설계안]] 참고', styles: { textColor: 'red' } }], children: [] },
  { type: 'checkListItem', props: { checked: true }, content: [{ type: 'text', text: '확인', styles: {} }], children: [] }
]
const memo = taskRepo.create({ category_id: cat.id, title: '회의 메모' })
taskRepo.update({ id: memo.id, note: md, note_doc: serializeNoteDoc(md, blocks), page_meta: JSON.stringify({ icon: '🧭', cover: 'gradient:2', evil: 'x' }) })

let saved = taskRepo.getById(memo.id)!
assert.deepEqual(resolveInitial(saved.note, saved.note_doc).blocks, blocks, 'stored losslessly')
assert.deepEqual(parsePageMeta(saved.page_meta), { icon: '🧭', cover: 'gradient:2' }, 'page meta sanitised on write')

// Invalid docs are refused rather than stored.
assert.throws(() => taskRepo.update({ id: memo.id, note_doc: '{not json' }), /note_doc/)
assert.throws(() => taskRepo.update({ id: memo.id, page_meta: '{not json' }), /page_meta/)

// Renaming the linked note keeps the lossless doc in step with the Markdown.
taskRepo.update({ id: target.id, title: '설계안 v2' })
saved = taskRepo.getById(memo.id)!
assert.equal(saved.note, '[[설계안 v2]] 참고\n\n* [x] 확인')
const doc = parseNoteDoc(saved.note_doc)!
assert.equal(doc.md, saved.note, 'doc still matches → still opens losslessly')
assert.ok(JSON.stringify(doc.blocks).includes('[[설계안 v2]]'))
assert.ok(JSON.stringify(doc.blocks).includes('"textColor":"red"'), 'formatting untouched')

// A repeating memo's next occurrence starts with its checklist cleared — in both forms.
taskRepo.update({ id: memo.id, recurrence: 'weekly', due_date: new Date('2099-01-05T00:00:00').toISOString() })
taskRepo.setStatus(memo.id, 'done')
const next = taskRepo.listByCategory(cat.id).find((t) => t.title === '회의 메모' && t.status === 'todo')!
assert.equal(next.note, '[[설계안 v2]] 참고\n\n* [ ] 확인')
const nextDoc = parseNoteDoc(next.note_doc)!
assert.equal(nextDoc.md, next.note)
assert.ok(JSON.stringify(nextDoc.blocks).includes('"checked":false'))
assert.equal(parsePageMeta(next.page_meta).icon, '🧭', 'icon / cover carried over')

// Duplicate = same content, formatting and page settings, new title.
const copy = taskRepo.duplicate(memo.id)
assert.equal(copy.title, '회의 메모 (사본)')
assert.equal(copy.note_doc, taskRepo.getById(memo.id)!.note_doc)
assert.equal(copy.page_meta, taskRepo.getById(memo.id)!.page_meta)
assert.equal(copy.status, 'todo')
assert.equal(copy.recurrence, null, 'a copy is a one-off')

console.log('note doc (main): all assertions passed')
