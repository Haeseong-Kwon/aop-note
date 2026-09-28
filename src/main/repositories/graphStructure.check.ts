import assert from 'node:assert'
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { workspaceRepo } from './workspace.repo'
import { categoryRepo } from './category.repo'
import { taskRepo } from './task.repo'
import { docFolderRepo } from './docFolder.repo'
import { linkRepo } from './link.repo'
import { addAttachment, addDocument } from '../attachments'
import { attachmentsDir } from '../attachmentPaths'
import { filterGraph } from '@shared/graphFilter'

// Every memo is in the graph the moment it exists — no [[links]], no linked folder needed:
// desk → sub-desk / category → sub-category → memo → sub-memo, plus 문서함 documents.
const desk = workspaceRepo.create({ name: '구조 데스크' })
const subDesk = workspaceRepo.create({ name: '하위 데스크', parent_id: desk.id })
const cat = categoryRepo.create({ workspace_id: desk.id, name: '기획' })
const subCat = categoryRepo.create({ workspace_id: desk.id, name: '리서치', parent_id: cat.id })
const memo = taskRepo.create({ category_id: cat.id, title: '빈 메모' }) // no body, no links
const child = taskRepo.create({ category_id: cat.id, parent_id: memo.id, title: '하위 메모' })
const deep = taskRepo.create({ category_id: subCat.id, title: '인터뷰 정리', note: '링크 없음' })

mkdirSync(attachmentsDir(), { recursive: true })
const src = join(mkdtempSync(join(tmpdir(), 'aop-gs-')), '계약.pdf')
writeFileSync(src, 'pdf')
const folder = docFolderRepo.create({ workspace_id: desk.id, name: '법무' })
const filed = addDocument(desk.id, folder.id, src, '계약.pdf')
const loose = addDocument(desk.id, null, src, '메모 없는 문서.pdf')
const attached = addAttachment(memo.id, src, '첨부.pdf')

const g = linkRepo.graph()
const kind = new Map(g.nodes.map((n) => [n.id, n.kind]))
const structure = (a: string, b: string): boolean => g.edges.some((e) => e.source === a && e.target === b && e.kind === 'structure')

assert.equal(kind.get(`desk:${desk.id}`), 'desk')
assert.equal(kind.get(`category:${cat.id}`), 'category')
assert.equal(kind.get(memo.id), 'note', 'a memo with no body and no links is still a node')
assert.ok(structure(`desk:${desk.id}`, `desk:${subDesk.id}`), 'desk → sub-desk')
assert.ok(structure(`desk:${desk.id}`, `category:${cat.id}`), 'desk → category')
assert.ok(structure(`category:${cat.id}`, `category:${subCat.id}`), 'category → sub-category')
assert.ok(structure(`category:${cat.id}`, memo.id), 'category → memo')
assert.ok(structure(memo.id, child.id), 'memo → sub-memo')
assert.ok(!structure(`category:${cat.id}`, child.id), 'a sub-memo hangs off its parent memo, not the category')
assert.ok(structure(`category:${subCat.id}`, deep.id))
// 문서함: folders, loose uploads, memo attachments
assert.ok(structure(`desk:${desk.id}`, `docfolder:${folder.id}`), 'desk → 문서함 folder')
assert.ok(structure(`docfolder:${folder.id}`, `attachment:${filed.id}`), '문서함 folder → document')
assert.ok(structure(`desk:${desk.id}`, `attachment:${loose.id}`), 'loose upload → desk')
assert.ok(structure(memo.id, `attachment:${attached.id}`), 'memo → its attachment')
assert.equal(g.nodes.find((n) => n.id === `attachment:${filed.id}`)?.attachment_id, filed.id, 'clickable: opens in the viewer')

// "linked only" keeps all of it (structure counts as a connection)…
const shown = filterGraph(g, { scope: desk.id, linkedOnly: true })
for (const id of [memo.id, child.id, deep.id, `attachment:${loose.id}`]) assert.ok(shown.nodes.some((n) => n.id === id), id)
// …and "links only" drops the structure: an Obsidian-style [[link]] graph.
const linksOnly = filterGraph(g, { scope: desk.id, linkedOnly: true, structure: false })
assert.equal(linksOnly.nodes.length, 0, 'no [[links]] in this desk')
const linked = taskRepo.create({ category_id: cat.id, title: '연결 메모', note: '[[인터뷰 정리]] 참고' })
const g2 = linkRepo.graph()
const l2 = filterGraph(g2, { scope: desk.id, linkedOnly: true, structure: false })
assert.deepEqual(l2.nodes.map((n) => n.id).sort(), [deep.id, linked.id].sort())
assert.ok(g2.edges.some((e) => e.source === linked.id && e.target === deep.id && e.kind === 'link'))

// A desk with a linked folder: the folder tree hangs off the desk, next to its memos.
const repo = mkdtempSync(join(tmpdir(), 'aop-gs-repo-'))
writeFileSync(join(repo, '보고서.docx'), 'x')
workspaceRepo.setFolder(desk.id, repo)
const g3 = linkRepo.graph()
assert.ok(g3.edges.some((e) => e.source === `desk:${desk.id}` && e.target === `folder:${desk.id}:` && e.kind === 'structure'), 'desk → linked folder')

console.log('graph structure: all assertions passed')
