import assert from 'node:assert'
import { execFileSync } from 'child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { workspaceRepo } from './repositories/workspace.repo'
import { categoryRepo } from './repositories/category.repo'
import { taskRepo } from './repositories/task.repo'
import { linkRepo } from './repositories/link.repo'
import { listProjects } from './projects'

// A desk linked to a git repo: repo docs, notes and commits form one graph.
const repo = mkdtempSync(join(tmpdir(), 'aop-brain-'))
const put = (rel: string, content: string): void => {
  mkdirSync(dirname(join(repo, rel)), { recursive: true })
  writeFileSync(join(repo, rel), content)
}
const git = (...args: string[]): void => {
  execFileSync('git', ['-C', repo, ...args], {
    env: { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@t' }
  })
}
put('README.md', '# 개요\n\n자세한 배경은 [[설계 결정]] 참고, [가이드](docs/guide.md)도.')
put('docs/guide.md', '처음이면 [[README]] 부터')
put('docs/api.md', '# API\n')
git('init', '-q', '-b', 'main')
git('add', '.')
git('commit', '-q', '-m', 'fix: 토큰 갱신 [[설계 결정]]')

const desk = workspaceRepo.setFolder(workspaceRepo.create({ name: '브레인 프로젝트' }).id, repo)
const cat = categoryRepo.create({ workspace_id: desk.id, name: '결정' })
const decision = taskRepo.create({
  category_id: cat.id,
  title: '설계 결정',
  note: 'API 형태는 [[docs/api]] 로 확정. 요약은 [[README]].'
})

// Backlinks of a note now include repo files and commits that mention it.
const back = linkRepo.backlinks(decision.id)
assert.deepEqual(
  back.files.map((f) => [f.path, f.snippet]),
  [['README.md', '자세한 배경은 [[설계 결정]] 참고, [가이드](docs/guide.md)도.']]
)
assert.equal(back.commits.length, 1)
assert.match(back.commits[0].subject, /토큰 갱신/)

// Backlinks of a file: notes and other files pointing at it.
const readmeBack = linkRepo.fileBacklinks(desk.id, 'README.md')
assert.deepEqual(readmeBack.linked.map((h) => h.task.id), [decision.id])
assert.deepEqual(readmeBack.files.map((f) => f.path), ['docs/guide.md'])

// Graph: file nodes with their own kind, wired to notes and to each other.
const g = linkRepo.graph()
const fileId = (p: string): string => `file:${desk.id}:${p}`
const kinds = new Map(g.nodes.map((n) => [n.id, n.kind]))
assert.equal(kinds.get(fileId('README.md')), 'file')
assert.equal(kinds.get(decision.id), 'note')
const edge = (a: string, b: string): boolean =>
  g.edges.some((e) => (e.source === a && e.target === b) || (e.source === b && e.target === a))
assert.ok(edge(decision.id, fileId('docs/api.md')), 'note → file via [[docs/api]]')
assert.ok(edge(decision.id, fileId('README.md')), 'note ↔ README both ways, one edge')
assert.ok(edge(fileId('README.md'), fileId('docs/guide.md')), 'Markdown link between docs')
assert.equal(g.edges.filter((e) => [e.source, e.target].sort().join() === [decision.id, fileId('README.md')].sort().join()).length, 1)

// A same-desk note wins over a same-named file.
const readmeNote = taskRepo.create({ category_id: cat.id, title: 'README', note: '앱 안의 README 메모' })
assert.equal(linkRepo.resolve('README', decision.id)?.id, readmeNote.id)

// A plain (non-dev) folder: documents with no [[links]] at all still form a graph —
// folder nodes tie them to their folders, so "linked only" keeps them — and bulk data
// (CSV datasets) doesn't crowd the documents out.
const plain = mkdtempSync(join(tmpdir(), 'aop-plain-'))
const putPlain = (rel: string): void => {
  mkdirSync(dirname(join(plain, rel)), { recursive: true })
  writeFileSync(join(plain, rel), 'x')
}
putPlain('기계학습론/강의자료.pdf')
for (let i = 0; i < 50; i++) putPlain(`기계학습론/데이터/sample-${i}.csv`)
putPlain('창업실습2/사업계획서.hwp')
putPlain('창업실습2/발표/최종발표.pptx')
putPlain('요약.docx')
const course = workspaceRepo.setFolder(workspaceRepo.create({ name: '4학년 2학기' }).id, plain)
const pg = linkRepo.graph()
const pid = (kind: string, p: string): string => `${kind}:${course.id}:${p}`
const pkinds = new Map(pg.nodes.map((n) => [n.id, n.kind]))
assert.ok(![...pkinds.keys()].some((id) => id.endsWith('.csv')), 'CSV data files are not documents')
for (const f of ['기계학습론/강의자료.pdf', '창업실습2/사업계획서.hwp', '창업실습2/발표/최종발표.pptx', '요약.docx']) {
  assert.equal(pkinds.get(pid('file', f)), 'file', f)
}
assert.equal(pkinds.get(pid('folder', '')), 'folder', 'the linked folder itself')
assert.equal(pkinds.get(pid('folder', '창업실습2/발표')), 'folder')
assert.ok(!pkinds.has(pid('folder', '기계학습론/데이터')), 'folders without documents are left out')
const pedge = (a: string, b: string): boolean => pg.edges.some((e) => e.source === a && e.target === b)
assert.ok(pedge(pid('folder', ''), pid('folder', '창업실습2')), 'root → course folder')
assert.ok(pedge(pid('folder', '창업실습2'), pid('folder', '창업실습2/발표')), 'folder → sub-folder')
assert.ok(pedge(pid('folder', '창업실습2/발표'), pid('file', '창업실습2/발표/최종발표.pptx')), 'folder → document')
assert.ok(pedge(pid('folder', ''), pid('file', '요약.docx')), 'root-level document')
assert.equal(pg.nodes.find((n) => n.id === pid('folder', '창업실습2'))?.title, '창업실습2')
assert.ok(pg.nodes.every((n) => n.kind !== 'file' || n.workspace_id !== course.id || n.links > 0), 'every document is connected')

console.log('brain: all assertions passed')

// --- project list (sidebar 프로젝트 menu) ---

const listed = listProjects()
const mine = listed.find((p) => p.desk_id === desk.id)
assert.ok(mine, 'linked desk is listed')
assert.equal(mine.folder, repo)
assert.equal(mine.exists, true)
assert.equal(mine.docs, 3)
assert.equal(mine.git?.branch, 'main')
assert.match(mine.git?.last_commit ?? '', /토큰 갱신/)
assert.ok(!listed.some((p) => p.desk_id === cat.workspace_id && p.desk_id !== desk.id), 'only desks with a folder')
console.log('project list: all assertions passed')
