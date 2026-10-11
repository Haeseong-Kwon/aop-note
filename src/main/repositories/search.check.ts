import assert from 'node:assert'
import { workspaceRepo } from './workspace.repo'
import { categoryRepo } from './category.repo'
import { taskRepo } from './task.repo'
import { searchRepo, ftsQuery } from './search.repo'
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { addAttachment, addDocument, removeAttachment } from '../attachments'
import { attachmentsDir } from '../attachmentPaths'
import { indexDocument } from '../docText'

// Graph search: memo titles AND bodies, every hit (not the palette's top 20), with a snippet.
const ws = workspaceRepo.create({ name: '검색 데스크' })
const cat = categoryRepo.create({ workspace_id: ws.id, name: '자료' })
const inBody = taskRepo.create({ category_id: cat.id, title: '주간 회의', note: '지난주 논의: 온보딩 퍼널 이탈률이 높다. 다음 액션은 인터뷰.' })
const inTitle = taskRepo.create({ category_id: cat.id, title: '퍼널 분석', note: '' })
const gone = taskRepo.create({ category_id: cat.id, title: '퍼널 삭제됨', note: '' })
taskRepo.remove(gone.id)
for (let i = 0; i < 25; i++) taskRepo.create({ category_id: cat.id, title: `메모 ${i}`, note: `여기에도 퍼널 언급 ${i}` })

const hits = searchRepo.notes('퍼널')
const ids = hits.map((h) => h.id)
assert.ok(ids.includes(inBody.id), 'body match')
assert.ok(ids.includes(inTitle.id), 'title match')
assert.ok(!ids.includes(gone.id), 'trashed memos are not found')
assert.ok(hits.length >= 27, 'not capped at the palette limit')
const body = hits.find((h) => h.id === inBody.id)
assert.match(body?.snippet ?? '', /온보딩 퍼널 이탈률/, 'snippet shows the text around the match')
assert.equal(hits.find((h) => h.id === inTitle.id)?.snippet, '', 'title-only hit: no snippet')
assert.deepEqual(searchRepo.notes('   '), [])
assert.deepEqual(searchRepo.notes('100%'), [], 'LIKE wildcards are literal')

// FTS5 (3+ char terms): ranked, title outranks body, multi-term AND, trash-aware via triggers.
assert.equal(ftsQuery('퍼널'), null, '2-char Korean term → LIKE path')
assert.equal(ftsQuery('a"bc'), '"a""bc"', 'quotes are escaped, never FTS syntax')
assert.doesNotThrow(() => searchRepo.notes('AND OR NOT "'), 'operators are literal')
assert.equal(ftsQuery('이탈률 인터뷰'), '"이탈률" AND "인터뷰"')
const titled = taskRepo.create({ category_id: cat.id, title: '이탈률 대시보드', note: '' })
const ranked = searchRepo.notes('이탈률').map((h) => h.id)
assert.deepEqual(ranked.slice(0, 2), [titled.id, inBody.id], 'title match ranks first')
assert.deepEqual(searchRepo.notes('이탈률 인터뷰').map((h) => h.id), [inBody.id], 'every term must match')
taskRepo.update({ id: inBody.id, note: '내용 교체됨' })
assert.ok(!searchRepo.notes('이탈률').some((h) => h.id === inBody.id), 'index follows edits')
taskRepo.remove(titled.id)
assert.ok(!searchRepo.notes('대시보드').length, 'index follows deletes')
assert.equal(searchRepo.query('대시보드').length, 0)

async function docs(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'aop-search-'))
  const src = join(dir, '분기 보고서.txt')
  writeFileSync(src, '3분기 매출은 전년 대비 증가했고 신규 고객 유입이 늘었다.')
  mkdirSync(attachmentsDir(), { recursive: true })
  const doc = addDocument(ws.id, null, src, '분기 보고서.txt')
  await indexDocument(doc.id)
  const hit = searchRepo.documents('신규 고객')[0]
  assert.equal(hit?.id, doc.id, 'document body is searchable')
  assert.match(hit.snippet, /신규 고객/)
  assert.equal(searchRepo.documents('보고서')[0]?.id, doc.id, 'and its name (short term → LIKE)')
  assert.ok(searchRepo.query('전년 대비').some((h) => h.type === 'document' && h.id === doc.id), 'palette shows documents')
  removeAttachment(doc.id)
  assert.equal(searchRepo.documents('신규 고객').length, 0, 'deleted documents drop out')

  // An attachment of a memo that went to the trash is not offered either (and comes back with it).
  const memoSrc = join(dir, '계약 메모 첨부.txt')
  writeFileSync(memoSrc, '위약금 조항은 갱신 시 재협상한다.')
  const holder = taskRepo.create({ category_id: cat.id, title: '첨부 있는 메모', note: '' })
  const att = addAttachment(holder.id, memoSrc, '계약 메모 첨부.txt')
  await indexDocument(att.id)
  assert.equal(searchRepo.documents('위약금 조항')[0]?.id, att.id)
  taskRepo.remove(holder.id)
  assert.equal(searchRepo.documents('위약금 조항').length, 0, "trashed memo's attachments are hidden")
  categoryRepo.remove(cat.id)
  assert.equal(searchRepo.documents('위약금 조항').length, 0)
  console.log('note search: all assertions passed')
}
docs().catch((e) => {
  console.error(e)
  process.exit(1)
})
