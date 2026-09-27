import assert from 'node:assert'
import { execFileSync } from 'child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { scanProject, resolveFile } from './projectIndex'
import { gitInfo } from './git'

const put = (root: string, rel: string, content: string): void => {
  mkdirSync(dirname(join(root, rel)), { recursive: true })
  writeFileSync(join(root, rel), content)
}

// --- plain folder: walk, skipping dependency / build / hidden folders ---
const plain = mkdtempSync(join(tmpdir(), 'aop-proj-'))
put(plain, 'README.md', '# 프로젝트 소개\n\n[[docs/auth]] 와 [설계](docs/design.md) 참고. [[인증 흐름|인증]]도 봐.')
put(plain, 'docs/auth.md', '토큰 만료는 [[README]] 참고')
put(plain, 'docs/design.md', '# 설계 문서\n')
put(plain, 'node_modules/pkg/readme.md', 'dependency docs')
put(plain, '.cache/notes.md', 'hidden')
put(plain, 'src/index.ts', 'export {}')

const idx = scanProject(plain)
assert.equal(idx.git, false)
assert.deepEqual(idx.files.map((f) => f.path), ['README.md', 'docs/auth.md', 'docs/design.md'])
assert.equal(idx.totalFiles, 4, 'code files are counted, not indexed')
const readme = idx.files[0]
assert.equal(readme.title, '프로젝트 소개', 'first H1 is the title')
assert.equal(idx.files[1].title, 'auth', 'no H1 → file name')
assert.deepEqual(readme.links, ['docs/auth', '인증 흐름'])
assert.deepEqual(readme.fileLinks, ['docs/design.md'], 'relative Markdown links resolved to project paths')

assert.equal(resolveFile(idx, 'docs/auth'), 'docs/auth.md')
assert.equal(resolveFile(idx, 'docs/auth.md'), 'docs/auth.md')
assert.equal(resolveFile(idx, 'auth'), 'docs/auth.md', 'unique base name resolves like Obsidian')
assert.equal(resolveFile(idx, 'README'), 'README.md')
assert.equal(resolveFile(idx, '인증 흐름'), null)

// --- non-dev folder: office / PDF / 한글 documents are graph nodes too ---
const office = mkdtempSync(join(tmpdir(), 'aop-office-'))
const nfd = (s: string): string => s.normalize('NFD') // macOS Finder stores 한글 file names decomposed
put(office, nfd('계약서.pdf'), '%PDF-1.4')
put(office, nfd('회의록/2026 킥오프.docx'), 'PK')
put(office, nfd('제안서.hwp'), 'HWP')
put(office, nfd('예산.xlsx'), 'PK')
put(office, nfd('발표.pptx'), 'PK')
put(office, nfd('메모.md'), `# 정리\n\n[[계약서]] 와 [발표](${encodeURIComponent('발표.pptx')}) 참고`)
put(office, 'photo.jpg', 'jpg')
const oidx = scanProject(office)
const paths = oidx.files.map((f) => f.path.normalize('NFC')).sort()
assert.deepEqual(paths, ['메모.md', '발표.pptx', '예산.xlsx', '제안서.hwp', '계약서.pdf', '회의록/2026 킥오프.docx'].sort())
const byName = (n: string): (typeof oidx.files)[number] | undefined => oidx.files.find((f) => f.path.normalize('NFC') === n)
assert.equal(byName('계약서.pdf')?.title, '계약서', 'binary docs: title = file name, NFC')
assert.deepEqual(byName('계약서.pdf')?.links, [], 'binary docs are not parsed for links')
assert.equal(resolveFile(oidx, '계약서')?.normalize('NFC'), '계약서.pdf', 'NFC [[link]] finds an NFD file name')
assert.equal(resolveFile(oidx, '2026 킥오프')?.normalize('NFC'), '회의록/2026 킥오프.docx')
assert.deepEqual(byName('메모.md')?.fileLinks.map((p) => p.normalize('NFC')), ['발표.pptx'], 'Markdown link to an office doc')

// --- git repo: follow .gitignore via git ls-files, include untracked docs ---
const repo = mkdtempSync(join(tmpdir(), 'aop-git-'))
const git = (...args: string[]): string =>
  execFileSync('git', ['-C', repo, ...args], {
    encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@t' }
  })
git('init', '-q', '-b', 'main')
put(repo, '.gitignore', 'build/\n')
put(repo, 'docs/a.md', '# A\n')
put(repo, 'docs/index.md', 'x')
put(repo, 'guide/index.md', 'y')
git('add', '.')
git('commit', '-q', '-m', '초기 설정 [[인증 흐름]] 정리')
put(repo, 'build/out.md', 'generated')
put(repo, 'notes/todo.md', 'untracked but not ignored')

const gidx = scanProject(repo)
assert.equal(gidx.git, true)
assert.deepEqual(gidx.files.map((f) => f.path), ['docs/a.md', 'docs/index.md', 'guide/index.md', 'notes/todo.md'])
assert.equal(resolveFile(gidx, 'index'), null, 'ambiguous base name does not resolve')

const info = gitInfo(repo)
assert.ok(info)
assert.equal(info.branch, 'main')
assert.equal(info.changed, 1, 'untracked notes/todo.md')
assert.equal(info.commits.length, 1)
assert.match(info.commits[0].subject, /\[\[인증 흐름\]\]/)
assert.match(info.commits[0].short, /^[0-9a-f]{7,}$/)
assert.equal(gitInfo(plain), null, 'not a repo')

// Reading git state must not write .git/index: the folder watcher would see the write,
// trigger a refresh, which reads git again — an endless refresh loop (flickering UI).
const { statSync, utimesSync } = require('fs') as typeof import('fs')
const later = new Date(Date.now() + 5000)
utimesSync(join(repo, 'docs', 'a.md'), later, later) // stale stat cache: git would like to refresh the index
const before = statSync(join(repo, '.git', 'index')).mtimeMs
gitInfo(repo)
scanProject(repo)
assert.equal(statSync(join(repo, '.git', 'index')).mtimeMs, before, 'read-only git calls leave the index alone')

console.log('project: all assertions passed')
