import { join } from 'path'
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'fs'
import { app, dialog, shell, BrowserWindow } from 'electron'
import Database from 'better-sqlite3'
import { getDb, closeDb, dbPath } from './db'
import { attachmentsDir } from './attachments'
import type { BackupInfo } from '@shared/types'

export const AUTO_BACKUP_KEEP = 7
const DB_FILE = 'aop-note.db'

export const backupsDir = (): string => join(app.getPath('userData'), 'backups')

const pad = (n: number): string => String(n).padStart(2, '0')
const day = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const stamp = (d: Date): string => `${day(d)} ${pad(d.getHours())}${pad(d.getMinutes())}`

/** Once per calendar day, snapshot the DB into userData/backups and keep the newest few. */
export async function autoBackup(now = new Date()): Promise<boolean> {
  const dir = backupsDir()
  mkdirSync(dir, { recursive: true })
  const file = `auto-${day(now)}.db`
  if (existsSync(join(dir, file))) return false

  await getDb().backup(join(dir, file))
  // Date-named, so lexical order is chronological.
  const autos = readdirSync(dir).filter((f) => /^auto-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort()
  for (const old of autos.slice(0, -AUTO_BACKUP_KEEP)) rmSync(join(dir, old), { force: true })
  return true
}

/** Write "AOP Note 백업 <date time>/" (DB + attachments) under parentDir; returns its path. */
export async function exportBackupTo(parentDir: string, now = new Date()): Promise<string> {
  const folder = join(parentDir, `AOP Note 백업 ${stamp(now)}`)
  mkdirSync(folder, { recursive: true })
  await getDb().backup(join(folder, DB_FILE))
  if (existsSync(attachmentsDir())) {
    cpSync(attachmentsDir(), join(folder, 'attachments'), { recursive: true })
  }
  return folder
}

/** Throws a user-facing message unless dir holds a readable AOP Note database. */
export function validateBackupDir(dir: string, file = DB_FILE): void {
  const path = join(dir, file)
  if (!existsSync(path)) throw new Error(`백업 폴더가 아닙니다. '${file}' 파일이 있는 폴더를 선택하세요.`)
  let probe: Database.Database | null = null
  try {
    probe = new Database(path, { readonly: true, fileMustExist: true })
    const ok = probe.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'workspaces'").get()
    if (!ok) throw new Error('no workspaces table')
  } catch {
    throw new Error('백업 파일을 읽을 수 없습니다. 손상되었거나 AOP Note 백업이 아닙니다.')
  } finally {
    probe?.close()
  }
}

export function backupInfo(): BackupInfo {
  const dir = backupsDir()
  const autos = existsSync(dir) ? readdirSync(dir).filter((f) => f.startsWith('auto-')).sort() : []
  const last = autos.at(-1)?.match(/auto-(\d{4}-\d{2}-\d{2})/)?.[1] ?? null
  return { data_dir: app.getPath('userData'), last_auto_backup: last }
}

// ---- dialog-driven entry points (IPC) ----

export async function exportBackup(win: BrowserWindow | null): Promise<string | null> {
  const options = {
    title: '백업을 저장할 위치 선택',
    buttonLabel: '여기에 백업',
    properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[]
  }
  const res = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  if (res.canceled || !res.filePaths[0]) return null
  return exportBackupTo(res.filePaths[0])
}

/**
 * Replace all data with a backup folder's, after saving the current data to
 * userData/backups. Relaunches the app; resolves false if the user cancels.
 */
export async function restoreBackup(win: BrowserWindow | null): Promise<boolean> {
  const pick = {
    title: '복원할 백업 폴더 선택',
    buttonLabel: '이 백업으로 복원',
    properties: ['openDirectory'] as 'openDirectory'[]
  }
  const res = win ? await dialog.showOpenDialog(win, pick) : await dialog.showOpenDialog(pick)
  const dir = res.filePaths[0]
  if (res.canceled || !dir) return false
  validateBackupDir(dir)

  const confirm = {
    type: 'warning' as const,
    buttons: ['복원 후 다시 시작', '취소'],
    defaultId: 1,
    cancelId: 1,
    message: '현재 데이터를 이 백업으로 바꿀까요?',
    detail: '지금 데이터는 복원 전에 데이터 폴더의 backups 안에 자동으로 저장됩니다. 복원이 끝나면 앱이 다시 시작됩니다.'
  }
  const answer = win ? await dialog.showMessageBox(win, confirm) : await dialog.showMessageBox(confirm)
  if (answer.response !== 0) return false

  mkdirSync(backupsDir(), { recursive: true })
  await getDb().backup(join(backupsDir(), `before-restore-${stamp(new Date()).replace(' ', '-')}.db`))

  closeDb()
  for (const suffix of ['-wal', '-shm']) rmSync(dbPath() + suffix, { force: true })
  copyFileSync(join(dir, DB_FILE), dbPath())
  // Merge rather than wipe: current attachment files stay on disk (harmless) and
  // everything the backup's memos reference is present.
  if (existsSync(join(dir, 'attachments'))) {
    cpSync(join(dir, 'attachments'), attachmentsDir(), { recursive: true, force: true })
  }

  app.relaunch()
  app.exit(0)
  return true
}

export function openDataFolder(): Promise<string> {
  return shell.openPath(app.getPath('userData'))
}
