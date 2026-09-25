import assert from 'node:assert'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { autoBackup, backupsDir, exportBackupTo, validateBackupDir, AUTO_BACKUP_KEEP } from './backup'
import { attachmentsDir } from './attachments'
import { workspaceRepo } from './repositories/workspace.repo'

async function main(): Promise<void> {
  workspaceRepo.create({ name: '백업 대상' })

  // Seed more stale auto backups than we keep; the oldest must be pruned.
  mkdirSync(backupsDir(), { recursive: true })
  for (let d = 1; d <= AUTO_BACKUP_KEEP + 2; d++) {
    writeFileSync(join(backupsDir(), `auto-2020-01-${String(d).padStart(2, '0')}.db`), '')
  }

  const today = new Date('2026-09-26T09:00:00')
  assert.equal(await autoBackup(today), true, 'first run of the day writes a backup')
  assert.equal(await autoBackup(today), false, 'second run the same day is a no-op')

  const autos = readdirSync(backupsDir()).filter((f) => f.startsWith('auto-')).sort()
  assert.equal(autos.length, AUTO_BACKUP_KEEP)
  assert.equal(autos.at(-1), 'auto-2026-09-26.db')
  assert.ok(!autos.includes('auto-2020-01-01.db'), 'oldest pruned')
  validateBackupDir(backupsDir(), 'auto-2026-09-26.db') // a real, readable DB

  // Manual export = DB + attachments in a fresh folder.
  mkdirSync(attachmentsDir(), { recursive: true })
  writeFileSync(join(attachmentsDir(), 'spec.pdf'), 'pdf')
  const parent = mkdtempSync(join(tmpdir(), 'aop-export-'))
  const folder = await exportBackupTo(parent, today)
  assert.ok(folder.startsWith(parent))
  assert.ok(existsSync(join(folder, 'attachments', 'spec.pdf')))
  validateBackupDir(folder)

  // Restoring from something that is not a backup is refused with a clear message.
  const empty = mkdtempSync(join(tmpdir(), 'aop-empty-'))
  assert.throws(() => validateBackupDir(empty), /백업 폴더가 아닙니다/)
  writeFileSync(join(empty, 'aop-note.db'), 'not sqlite')
  assert.throws(() => validateBackupDir(empty), /읽을 수 없습니다/)

  console.log('backup: all assertions passed')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
