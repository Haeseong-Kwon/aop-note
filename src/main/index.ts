import { join } from 'path'
import { pathToFileURL } from 'url'
import { existsSync } from 'fs'
import { app, shell, BrowserWindow, protocol, net } from 'electron'
import { getDb, closeDb } from './db'
import { registerIpcHandlers } from './ipc/handlers'
import { startDueNotifier } from './notifications'
import { pathForStored } from './attachments'

let stopNotifier: (() => void) | null = null

// Custom scheme to serve attachment files to the renderer (PDF iframe, images)
// without exposing file:// or relaxing sandboxing. Must be registered before ready.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'aop-file',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
])

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 600,
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#0b0b0f',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      // Security: renderer has no Node access; only window.api via contextBridge.
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => win.show())

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
  // Serve attachment files via aop-file://<storedName> (basename-guarded).
  protocol.handle('aop-file', (request) => {
    const storedName = decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, '')
    const abs = pathForStored(storedName)
    if (!storedName || !existsSync(abs)) return new Response('Not found', { status: 404 })
    return net.fetch(pathToFileURL(abs).toString())
  })

  // Open DB + run migrations before the UI asks for data.
  getDb()
  registerIpcHandlers()
  const win = createWindow()
  stopNotifier = startDueNotifier(win)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      stopNotifier?.()
      stopNotifier = startDueNotifier(createWindow())
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  stopNotifier?.()
  closeDb()
})
