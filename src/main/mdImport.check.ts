import assert from 'node:assert'
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { importMarkdownFolder, parseNote, convertLinks, cleanName } from './mdImport'
import { categoryRepo } from './repositories/category.repo'
import { taskRepo } from './repositories/task.repo'
import { workspaceRepo } from './repositories/workspace.repo'

assert.equal(cleanName('회의록 0f3b2a1c9d8e7f6a5b4c3d2e1f0a9b8c'), '회의록', 'Notion id suffix dropped')
assert.deepEqual(parseNote('---\ntitle: "프론트매터 제목"\ntags: [a]\n---\n# 프론트매터 제목\n\n본문', 'file'), { title: '프론트매터 제목', body: '본문' })
assert.deepEqual(parseNote('# 첫 제목\n\n내용', 'file'), { title: '첫 제목', body: '내용' })
assert.deepEqual(parseNote('그냥 내용', '파일 이름'), { title: '파일 이름', body: '그냥 내용' })
assert.equal(
  convertLinks('[다음 단계](%EB%8B%A4%EC%9D%8C%20%EB%8B%A8%EA%B3%84%200f3b2a1c9d8e7f6a5b4c3d2e1f0a9b8c.md) · [웹](https://x.com/a.md) · ![img](a.png) · [별칭](기획서.md)'),
  '[[다음 단계]] · [웹](https://x.com/a.md) · ![img](a.png) · [[기획서|별칭]]',
  'relative .md links → wiki links; external links kept'
)

const root = join(mkdtempSync(join(tmpdir(), 'aop-import-')), '내 볼트')
mkdirSync(join(root, '프로젝트', '하위'), { recursive: true })
mkdirSync(join(root, '.obsidian'))
writeFileSync(join(root, '.obsidian', 'app.json'), '{}')
writeFileSync(join(root, '루트 메모.md'), '# 루트 메모\n\n[[기획서]] 참고')
writeFileSync(join(root, '프로젝트', '기획서.md'), '기획 내용')
writeFileSync(join(root, '프로젝트', '하위', '세부.markdown'), '세부 내용')
writeFileSync(join(root, '프로젝트', 'image.png'), 'png')

const res = importMarkdownFolder(root)
assert.equal(res.desk.name, '내 볼트')
assert.equal(res.notes, 3)
assert.equal(res.folders, 2, '.obsidian skipped')
const cats = categoryRepo.listByWorkspace(res.desk.id)
const byName = new Map(cats.map((c) => [c.name, c]))
assert.equal(byName.get('하위')?.parent_id, byName.get('프로젝트')?.id, 'nested folders keep their nesting')
assert.ok(byName.has('가져온 메모'), 'root-level notes get a folder')
const tasks = taskRepo.listByWorkspace(res.desk.id)
assert.equal(tasks.find((t) => t.title === '루트 메모')?.note, '[[기획서]] 참고')
assert.ok(tasks.some((t) => t.title === '세부' && t.category_id === byName.get('하위')?.id))

const empty = mkdtempSync(join(tmpdir(), 'aop-import-empty-'))
const before = workspaceRepo.list().length
assert.throws(() => importMarkdownFolder(empty), /찾지 못했습니다/)
assert.equal(workspaceRepo.list().length, before, 'nothing half-imported on failure (one transaction)')
console.log('markdown import: all assertions passed')
