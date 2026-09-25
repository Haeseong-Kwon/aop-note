import assert from 'node:assert'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { writeVault, fileNameFor } from './vault'
import { workspaceRepo } from './repositories/workspace.repo'
import { categoryRepo } from './repositories/category.repo'
import { taskRepo } from './repositories/task.repo'
import { attachmentsDir } from './attachmentPaths'

assert.equal(fileNameFor('광고 소재 A/B 테스트'), '광고 소재 A-B 테스트')
assert.equal(fileNameFor('  what? "quote" #tag  '), 'what- -quote- -tag')
assert.equal(fileNameFor('...'), '제목 없음', 'nothing usable left')

const ws = workspaceRepo.create({ name: '볼트 데스크' })
const parent = categoryRepo.create({ workspace_id: ws.id, name: '연구' })
const child = categoryRepo.create({ workspace_id: ws.id, name: '논문', parent_id: parent.id })
const target = taskRepo.create({ category_id: child.id, title: 'A/B 테스트 설계' })
const source = taskRepo.create({
  category_id: parent.id,
  title: '연구 계획',
  note: '핵심은 [[A/B 테스트 설계]] 와 [[없는 메모]].\n\n![차트](aop-file:///chart-1.png)\n\n[보고서.pdf](aop-file:///report-2.pdf)',
  priority: 2,
  due_date: new Date('2026-10-01T00:00:00').toISOString(),
  recurrence: 'weekly'
})
mkdirSync(attachmentsDir(), { recursive: true })
writeFileSync(join(attachmentsDir(), 'chart-1.png'), 'png')
writeFileSync(join(attachmentsDir(), 'report-2.pdf'), 'pdf')

const root = mkdtempSync(join(tmpdir(), 'aop-vault-'))
writeFileSync(join(root, '내 메모.md'), 'user file outside the mirror')
writeVault(root)

const base = join(root, 'AOP Note')
const sourcePath = join(base, '볼트 데스크', '연구', '연구 계획.md')
const targetPath = join(base, '볼트 데스크', '연구', '논문', 'A-B 테스트 설계.md')
assert.ok(existsSync(targetPath), 'child category nests under its parent; unsafe chars replaced')
const md = readFileSync(sourcePath, 'utf8')
assert.match(md, new RegExp(`^---\\naop_id: ${source.id}\\n`), 'frontmatter first')
assert.match(md, /\nstatus: todo\n/)
assert.match(md, /\npriority: 2\n/)
assert.match(md, /\ndue: 2026-10-01\n/)
assert.match(md, /\nrecurrence: weekly\n/)
assert.ok(md.includes('[[A-B 테스트 설계|A/B 테스트 설계]]'), 'link retargeted to the file name, title kept as alias')
assert.ok(md.includes('[[없는 메모]]'), 'unresolved links left as-is (Obsidian shows them as unresolved too)')
assert.ok(md.includes('![[chart-1.png]]') && md.includes('[[report-2.pdf|보고서.pdf]]'), 'attachments embedded')
assert.ok(existsSync(join(base, '_attachments', 'chart-1.png')))
assert.ok(readFileSync(join(base, 'AOP Note.md'), 'utf8').includes('[[연구 계획]]'), 'index note links every note')

// Deleting in the app removes the file on the next sync; files it didn't write survive.
taskRepo.remove(target.id)
writeFileSync(join(base, '볼트 데스크', '직접 만든 노트.md'), 'user note inside the mirror folder')
writeVault(root)
assert.ok(!existsSync(targetPath), 'stale mirror file removed')
assert.ok(existsSync(join(base, '볼트 데스크', '직접 만든 노트.md')), 'unmanaged file kept')
assert.ok(existsSync(join(root, '내 메모.md')), 'nothing outside "AOP Note/" is touched')

console.log('vault: all assertions passed')
