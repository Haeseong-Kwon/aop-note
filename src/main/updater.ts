import { app, dialog, shell, BrowserWindow } from 'electron'
import { autoUpdater, type UpdateInfo } from 'electron-updater'
import type { UpdateStatus } from '@shared/types'

// Updates from GitHub Releases (electron-builder `publish: github`). Windows downloads in
// the background and offers a restart. macOS builds are not Developer-ID signed, and
// Squirrel.Mac refuses to install unsigned updates, so there we announce the new version
// and open its release page instead.
// ponytail: mac self-install once the app is signed + notarized (flip AUTO_INSTALL for darwin).

const RELEASES_URL = 'https://github.com/Haeseong-Kwon/aop-note/releases/latest'
const CHECK_EVERY_MS = 6 * 60 * 60_000
const AUTO_INSTALL = process.platform === 'win32'

let status: UpdateStatus = { current: app.getVersion(), state: 'idle', latest: null, error: null }
let announced: string | null = null

const focused = (): BrowserWindow | undefined => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]

async function offer(info: UpdateInfo, ready: boolean): Promise<void> {
  if (announced === `${info.version}:${ready}`) return
  announced = `${info.version}:${ready}`
  const win = focused()
  const opts = ready
    ? {
        type: 'info' as const,
        buttons: ['지금 다시 시작', '나중에'],
        defaultId: 0,
        cancelId: 1,
        message: `AOP Note ${info.version} 업데이트가 준비되었습니다.`,
        detail: '다시 시작하면 바로 적용됩니다. 나중을 고르면 앱을 끌 때 설치됩니다.'
      }
    : {
        type: 'info' as const,
        buttons: ['다운로드 페이지 열기', '나중에'],
        defaultId: 0,
        cancelId: 1,
        message: `AOP Note ${info.version} 버전이 나왔습니다 (지금 ${app.getVersion()}).`,
        detail: '새 버전을 받아 응용 프로그램 폴더의 앱을 바꾸세요. 데이터는 그대로 유지됩니다.'
      }
  const { response } = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts)
  if (response !== 0) return
  if (ready) autoUpdater.quitAndInstall()
  else void shell.openExternal(RELEASES_URL)
}

export function updateStatus(): UpdateStatus {
  return status
}

/** Check now; resolves the new status (also used by Settings → 업데이트 확인). */
export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!app.isPackaged) return (status = { ...status, state: 'unsupported', error: '개발 모드에서는 업데이트를 확인하지 않습니다.' })
  status = { ...status, state: 'checking', error: null }
  try {
    const result = await autoUpdater.checkForUpdates()
    const latest = result?.updateInfo.version ?? null
    const newer = result?.isUpdateAvailable ?? false
    status = { ...status, latest, state: newer ? (AUTO_INSTALL ? 'downloading' : 'available') : 'latest' }
  } catch (error) {
    status = { ...status, state: 'error', error: error instanceof Error ? error.message : String(error) }
  }
  return status
}

export function startAutoUpdate(): () => void {
  if (!app.isPackaged) return () => undefined
  // Explicit feed: also works for builds packaged without app-update.yml (electron-builder --dir).
  autoUpdater.setFeedURL({ provider: 'github', owner: 'Haeseong-Kwon', repo: 'aop-note' })
  autoUpdater.autoDownload = AUTO_INSTALL
  autoUpdater.autoInstallOnAppQuit = AUTO_INSTALL
  autoUpdater.on('update-available', (info) => {
    if (!AUTO_INSTALL) void offer(info, false)
  })
  autoUpdater.on('update-downloaded', (info) => {
    status = { ...status, state: 'ready', latest: info.version }
    void offer(info, true)
  })
  autoUpdater.on('error', (error) => {
    console.error('[update] failed:', error.message) // offline / no release yet: retried on the next check
    status = { ...status, state: 'error', error: error.message }
  })
  void checkForUpdates()
  const timer = setInterval(() => void checkForUpdates(), CHECK_EVERY_MS)
  return () => clearInterval(timer)
}
