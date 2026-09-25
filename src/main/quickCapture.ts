import { app, globalShortcut, Menu, nativeImage, Tray, type BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc'

/** ⌘Space is Spotlight and Ctrl+Space switches Korean input, so use ⌘⇧Space. */
export const QUICK_CAPTURE_ACCELERATOR = 'CommandOrControl+Shift+Space'

let tray: Tray | null = null // module-level so it isn't garbage-collected
let capture: (() => void) | null = null

/** Bring the window forward and open quick capture (after load, if it was just created). */
function openQuickCapture(win: BrowserWindow): void {
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  if (process.platform === 'darwin') app.focus({ steal: true })
  const send = (): void => win.webContents.send(IPC.events.quickCapture)
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send)
  else send()
}

/**
 * System-wide quick capture: a global shortcut, plus a menu-bar icon on macOS.
 * `getWindow` returns the main window, creating it if it was closed.
 */
/** Turn the global shortcut on/off (settings). False if another app already owns it. */
export function setShortcutEnabled(enabled: boolean): boolean {
  globalShortcut.unregister(QUICK_CAPTURE_ACCELERATOR)
  if (!enabled || !capture) return true
  const ok = globalShortcut.register(QUICK_CAPTURE_ACCELERATOR, capture)
  if (!ok) console.warn(`[quick-capture] ${QUICK_CAPTURE_ACCELERATOR} is taken by another app`)
  return ok
}

export function setupQuickCapture(getWindow: () => BrowserWindow, shortcut: boolean): () => void {
  const open = (): void => openQuickCapture(getWindow())
  capture = open
  setShortcutEnabled(shortcut)

  if (process.platform === 'darwin') {
    // A built-in AppKit template symbol: adapts to light/dark menu bars, no asset to ship.
    const icon = nativeImage.createFromNamedImage('NSTouchBarComposeTemplate')
    if (!icon.isEmpty()) {
      icon.setTemplateImage(true)
      tray = new Tray(icon.resize({ height: 18 }))
      tray.setToolTip('AOP Note')
      tray.setContextMenu(
        Menu.buildFromTemplate([
          { label: '빠른 추가', accelerator: QUICK_CAPTURE_ACCELERATOR, click: open },
          {
            label: 'AOP Note 열기',
            click: () => {
              const win = getWindow()
              win.show()
              win.focus()
            }
          },
          { type: 'separator' },
          { label: '종료', role: 'quit' }
        ])
      )
    }
  }

  return () => {
    globalShortcut.unregister(QUICK_CAPTURE_ACCELERATOR)
    capture = null
    tray?.destroy()
    tray = null
  }
}
