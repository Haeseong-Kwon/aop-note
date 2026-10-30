import { registerPlugin } from '@capacitor/core'
import { ipcMain } from './shims/electron'
import { flushed, hydrate, mount } from './shims/fs'
import { persisterFor, readTree } from './storage'
import { IPC } from '@shared/ipc'
import { loadSettings, saveSettings } from '../main/settings'
import { syncDir, syncNow } from '../main/sync'
import { notifyMerged } from '../main/ipc/handlers'
import type { SyncResult } from '@shared/types'

// Device sync on Android: the desktop's shared-folder sync (src/main/sync.ts), run against
// a folder on shared storage that Syncthing keeps in step with the desktop's folder.
// Before each round the folder is re-read from disk, since Syncthing changes it behind our back.

/** Native side (MainActivity): "All files access", needed to read files Syncthing wrote. */
const StorageAccess = registerPlugin<{
  status(): Promise<{ granted: boolean }>
  request(): Promise<void>
}>('StorageAccess')

/** Syncthing's default folder on Android. */
const DEFAULT_ROOT = '/storage/emulated/0/Sync'
const SYNC_INTERVAL_MS = 2 * 60_000

let running: Promise<SyncResult> | null = null

async function round(root: string): Promise<SyncResult> {
  const dir = syncDir(root)
  const loc = { base: dir }
  mount(dir, persisterFor(dir, loc))
  await flushed() // our last snapshot reaches disk before we re-read the folder
  hydrate(dir, (await readTree(loc)).map(([rel, bytes]) => [`${dir}/${rel}`, bytes]))
  const result = syncNow(root)
  await flushed()
  if (result.merged > 0) notifyMerged()
  return result
}

/** One sync round at a time; a round already running is shared. */
function syncOnce(root: string): Promise<SyncResult> {
  running ??= round(root).finally(() => {
    running = null
  })
  return running
}

async function ensureAccess(): Promise<void> {
  if ((await StorageAccess.status()).granted) return
  await StorageAccess.request()
  if (!(await StorageAccess.status()).granted) {
    throw new Error('동기화하려면 "모든 파일 액세스" 권한을 허용해 주세요.')
  }
}

/** Replace the desktop's folder-picker sync handlers and keep syncing in the background. */
export function installMobileSync(): void {
  ipcMain.removeHandler(IPC.data.syncChoose)
  ipcMain.handle(IPC.data.syncChoose, async () => {
    const root = window.prompt('Syncthing 폴더 경로 (그 안의 "AOP Note Sync" 폴더를 데스크톱과 공유)', loadSettings().syncPath || DEFAULT_ROOT)?.trim()
    if (!root) return null
    await ensureAccess()
    await syncOnce(root)
    return saveSettings({ syncPath: root })
  })
  ipcMain.removeHandler(IPC.data.syncNow)
  ipcMain.handle(IPC.data.syncNow, async () => {
    const root = loadSettings().syncPath
    if (!root) throw new Error('동기화 폴더가 설정되지 않았습니다.')
    await ensureAccess()
    return syncOnce(root)
  })

  const background = (): void => {
    const root = loadSettings().syncPath
    if (!root) return
    syncOnce(root).catch((error) => console.error('[sync] failed:', error))
  }
  background()
  setInterval(background, SYNC_INTERVAL_MS)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') background()
  })
}
