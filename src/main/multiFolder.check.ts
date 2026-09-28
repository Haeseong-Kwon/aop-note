import assert from 'node:assert'
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { workspaceRepo } from './repositories/workspace.repo'
import { categoryRepo } from './repositories/category.repo'
import { taskRepo } from './repositories/task.repo'
import { linkRepo } from './repositories/link.repo'
import { getDeskIndex, projectFilePath } from './projectFiles'
import { projectOverview, unlinkFolder } from './projects'
import { resolveFile } from './projectIndex'
import { projectBrief } from '../mcp/tools'

// One project, several folders: a plain folder of documents and a dev repo with docs.
const make = (name: string, files: Record<string, string>): string => {
  const root = join(mkdtempSync(join(tmpdir(), 'aop-multi-')), name)
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true })
    writeFileSync(join(root, rel), body)
  }
  return root
}
const plain = make('기획자료', { '보고서.docx': 'x', '회의/킥오프.pdf': 'x' })
const repo = make('web', { 'README.md': '# 웹\n[설계](docs/api.md)', 'docs/api.md': '# API\n' })
const sameName = make('web', { 'notes.md': '# 다른 web' })

const desk = workspaceRepo.create({ name: '멀티 폴더' })
workspaceRepo.addFolder(desk.id, plain)
assert.deepEqual(workspaceRepo.folders(desk.id), [plain])
assert.equal(workspaceRepo.getById(desk.id)?.folder_path, plain, 'first folder stays the primary (legacy field)')

// A single folder: paths exactly as before (no prefix).
assert.deepEqual(getDeskIndex(desk.id)?.files.map((f) => f.path).sort(), ['보고서.docx', '회의/킥오프.pdf'])

workspaceRepo.addFolder(desk.id, repo)
workspaceRepo.addFolder(desk.id, repo) // twice: ignored
assert.deepEqual(workspaceRepo.folders(desk.id), [plain, repo])

// Several folders: one merged index, each path under its folder's name.
const idx = getDeskIndex(desk.id)
assert.ok(idx)
assert.deepEqual(idx.files.map((f) => f.path).sort(), ['web/README.md', 'web/docs/api.md', '기획자료/보고서.docx', '기획자료/회의/킥오프.pdf'])
assert.deepEqual(idx.folders.map((f) => [f.label, f.path]), [['기획자료', plain], ['web', repo]])
assert.deepEqual(idx.files.find((f) => f.path === 'web/README.md')?.fileLinks, ['web/docs/api.md'], 'Markdown links stay inside their folder')
assert.equal(resolveFile(idx, 'docs/api'), 'web/docs/api.md', 'an old [[docs/api]] link still resolves')
assert.equal(projectFilePath(desk.id, 'web/docs/api.md'), join(repo, 'docs/api.md'))
assert.equal(projectFilePath(desk.id, '../etc/passwd'), null)

// Same folder name twice: told apart.
workspaceRepo.addFolder(desk.id, sameName)
assert.deepEqual(getDeskIndex(desk.id)?.folders.map((f) => f.label), ['기획자료', 'web', 'web (2)'])
assert.ok(getDeskIndex(desk.id)?.files.some((f) => f.path === 'web (2)/notes.md'))

// Overview lists every folder.
const ov = projectOverview(desk.id)
assert.deepEqual(ov?.folders.map((f) => [f.label, f.exists, f.docs]), [['기획자료', true, 2], ['web', true, 2], ['web (2)', true, 1]])

// Graph: each folder hangs off the desk directly (no shared root), memos alongside.
const cat = categoryRepo.create({ workspace_id: desk.id, name: '메모' })
taskRepo.create({ category_id: cat.id, title: '연결 메모', note: '[[킥오프]] 참고' })
const g = linkRepo.graph()
const structure = (a: string, b: string): boolean => g.edges.some((e) => e.source === a && e.target === b && e.kind === 'structure')
for (const label of ['기획자료', 'web', 'web (2)']) assert.ok(structure(`desk:${desk.id}`, `folder:${desk.id}:${label}`), label)
assert.ok(!g.nodes.some((n) => n.id === `folder:${desk.id}:`), 'no virtual root folder')
assert.ok(structure(`folder:${desk.id}:기획자료/회의`, `file:${desk.id}:기획자료/회의/킥오프.pdf`))
assert.ok(g.edges.some((e) => e.target === `file:${desk.id}:기획자료/회의/킥오프.pdf` && e.kind === 'link'), '[[킥오프]] finds the file in either folder')

// A Claude Code session in any of the folders gets this desk's brief.
assert.match(projectBrief(join(repo, 'docs')) ?? '', /멀티 폴더/)
assert.match(projectBrief(sameName) ?? '', /멀티 폴더/)

// Unlinking one folder; back to one folder → back to plain paths.
unlinkFolder(desk.id, sameName)
unlinkFolder(desk.id, repo)
assert.deepEqual(workspaceRepo.folders(desk.id), [plain])
assert.ok(getDeskIndex(desk.id)?.files.some((f) => f.path === '보고서.docx'))
unlinkFolder(desk.id, plain)
assert.equal(workspaceRepo.getById(desk.id)?.folder_path, null)
assert.equal(getDeskIndex(desk.id), null)

workspaceRepo.remove(desk.id) // leave no stray [[킥오프]] ghost for later checks

console.log('multi folder: all assertions passed')
