import { join, basename } from 'path'
import { pathToFileURL } from 'url'
import { existsSync } from 'fs'
import { app, shell, BrowserWindow, Menu, protocol, net } from 'electron'
import { getDb, closeDb } from './db'
import { registerIpcHandlers } from './ipc/handlers'
import { startDueNotifier } from './notifications'
import { pathForStored } from './attachments'
import { autoBackup } from './backup'
import { setupQuickCapture } from './quickCapture'
import { loadSettings } from './settings'
import { scheduleVaultSync } from './vault'
import { projectFilePath, startProjectWatching } from './projects'
import { syncAllCalendars } from './calendars'
import { IPC } from '@shared/ipc'
import { applyBackdrop, solidBackdrop } from './backdrop'

let stopNotifier: (() => void) | null = null
let stopQuickCapture: (() => void) | null = null
let stopProjectWatching: (() => void) | null = null
let calendarTimer: ReturnType<typeof setInterval> | null = null
const CALENDAR_SYNC_MS = 30 * 60_000

// Windows: toasts only show for an app with an AppUserModelID (must match the installer's appId).
if (process.platform === 'win32') app.setAppUserModelId('com.aop.note')

// One copy of the app (one SQLite writer). A second launch focuses the running window.
if (!app.requestSingleInstanceLock()) app.exit(0) // exit now: quit() would still let 'ready' open a window
app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
})

// Custom scheme to serve attachment files to the renderer (PDF iframe, images)
// without exposing file:// or relaxing sandboxing. Must be registered before ready.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'aop-file',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  },
  {
    scheme: 'aop-project',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
])

const isMac = process.platform === 'darwin'

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 600,
    show: false,
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    // macOS: a transparent backdrop lets the native vibrancy blur show through the
    // translucent panels in the renderer. Other platforms keep a solid backdrop.
    backgroundColor: isMac ? '#00000000' : solidBackdrop(),
    ...(isMac
      ? { vibrancy: 'under-window' as const, visualEffectState: 'active' as const }
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      // Security: renderer has no Node access; only window.api via contextBridge.
      contextIsolation: true,
      nodeIntegration: false,
      // Chromium has no Korean dictionary, so it red-underlines most of a memo.
      spellcheck: false
    }
  })

  win.on('ready-to-show', () => win.show())
  win.on('enter-full-screen', () => applyBackdrop(win))
  win.on('leave-full-screen', () => applyBackdrop(win))

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // electron-vite injects ELECTRON_RENDERER_URL in dev; load the file in prod.
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  // Windows / Linux: no File·Edit·View menu bar — the app has its own UI for everything,
  // and copy/paste/undo shortcuts work in Chromium without menu items there.
  if (!isMac) Menu.setApplicationMenu(null)
  // Serve attachment files via aop-file://<storedName> (basename-guarded).
  protocol.handle('aop-file', (request) => {
    // A standard scheme may put the filename in the host (aop-file://name) or the
    // path (aop-file:///name) depending on Chromium normalization — combine both.
    const u = new URL(request.url)
    const storedName = basename(decodeURIComponent(u.hostname + u.pathname))
    const abs = pathForStored(storedName)
    if (!storedName || !existsSync(abs)) return new Response('Not found', { status: 404 })
    return net.fetch(pathToFileURL(abs).toString())
  })

  // Serve linked-folder documents via aop-project:///<deskId>/<path> — only files in that desk's index.
  protocol.handle('aop-project', (request) => {
    // Like aop-file: Chromium may move the first segment (the desk id) into the host.
    const u = new URL(request.url)
    const [deskId, path] = (u.hostname + u.pathname).split('/').filter(Boolean).map(decodeURIComponent)
    const abs = deskId && path ? projectFilePath(deskId, path) : null
    if (!abs || !existsSync(abs)) return new Response('Not found', { status: 404 })
    return net.fetch(pathToFileURL(abs).toString())
  })

  // Open DB + run migrations before the UI asks for data.
  getDb()
  registerIpcHandlers()
  const win = createWindow()
  stopNotifier = startDueNotifier(win)
  // Daily safety snapshot. Never blocks startup; a failure is logged, not fatal.
  autoBackup().catch((error) => console.error('[backup] auto backup failed:', error))
  // Subscribed calendars: refresh on start and every 30 min (errors are kept per calendar).
  const syncCalendars = (): void => {
    syncAllCalendars()
      .then(() => {
        for (const w of BrowserWindow.getAllWindows()) w.webContents.send(IPC.events.calendarsSynced)
      })
      .catch((error) => console.error('[calendar] sync failed:', error))
  }
  syncCalendars()
  calendarTimer = setInterval(syncCalendars, CALENDAR_SYNC_MS)
  // Bring the Markdown mirror up to date (e.g. after an app update changed its format).
  scheduleVaultSync(() => loadSettings().vaultPath)

  // The window may have been closed (macOS keeps the app running); recreate on demand.
  const mainWindow = (): BrowserWindow => {
    const existing = BrowserWindow.getAllWindows()[0]
    if (existing) return existing
    const created = createWindow()
    stopNotifier?.()
    stopNotifier = startDueNotifier(created)
    return created
  }
  stopQuickCapture = setupQuickCapture(mainWindow, loadSettings().globalShortcut)
  stopProjectWatching = startProjectWatching((deskId) => {
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send(IPC.events.projectChanged, deskId)
  })

  app.on('activate', () => {
    mainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  stopNotifier?.()
  stopQuickCapture?.()
  stopProjectWatching?.()
  if (calendarTimer) clearInterval(calendarTimer)
  closeDb()
})
