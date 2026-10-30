import { Buffer } from 'buffer'
import { App } from '@capacitor/app'
import { registerPlugin, SystemBars, SystemBarsStyle } from '@capacitor/core'
import { Directory } from '@capacitor/filesystem'
import { initSqlite, onWrite, preloadDb } from './shims/better-sqlite3'
import { DATA_DIR, ipcMain, nativeTheme } from './shims/electron'
import { flushed, hydrate, mount } from './shims/fs'
import { persisterFor, readBytes, readTree, writeBytes } from './storage'
import { IPC, EDIT_COMMANDS, type EditCommand } from '@shared/ipc'

// Android entry: boot the "main process" (DB, IPC handlers, sync) inside the WebView,
// expose window.api through the unchanged preload, then start the unchanged renderer.

const DB_FILE = 'aop-note.db'
const DB_SAVE_DEBOUNCE_MS = 800
const data = { directory: Directory.Data, base: '' }

Object.assign(globalThis, {
  Buffer,
  process: { platform: 'android', env: {}, versions: {}, arch: 'arm64', cwd: () => '/' }
})

/** The DB lives in memory; its bytes are written back shortly after each change and when the app goes to background. */
function persistDbOnChange(exportDb: () => Uint8Array): () => Promise<void> {
  let timer: ReturnType<typeof setTimeout> | null = null
  let saving: Promise<void> = Promise.resolve()
  const save = (): Promise<void> => {
    if (timer) clearTimeout(timer)
    timer = null
    const bytes = exportDb()
    saving = saving.then(() => writeBytes(data, DB_FILE, bytes)).catch((error) => console.error('[db] save failed:', error))
    return saving
  }
  onWrite(() => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(save, DB_SAVE_DEBOUNCE_MS)
  })
  return save
}

/** Handlers whose desktop versions need a native window. */
function installMobileHandlers(): void {
  ipcMain.removeHandler(IPC.theme.set)
  ipcMain.handle(IPC.theme.set, (_e: unknown, theme: unknown) => {
    nativeTheme.themeSource = String(theme)
  })
  ipcMain.removeHandler(IPC.edit.run)
  ipcMain.handle(IPC.edit.run, (_e: unknown, command: unknown) => {
    if (EDIT_COMMANDS.includes(command as EditCommand)) document.execCommand(String(command))
  })
}

/** Native side (MainActivity): the window color around an inset (older) WebView. */
const SystemColors = registerPlugin<{ setBackground(options: { color: string }): Promise<void> }>('SystemColors')

const toHex = (rgb: string): string | null => {
  const m = rgb.match(/\d+/g)
  return m && m.length >= 3 ? `#${m.slice(0, 3).map((n) => Number(n).toString(16).padStart(2, '0')).join('')}` : null
}

/** System bars follow the app's light/dark theme (the `dark` class on <html>): icon color and the color behind them. */
function followThemeInSystemBars(): () => void {
  const apply = (): void => {
    const dark = document.documentElement.classList.contains('dark')
    void SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light })
    // After the theme's CSS has applied to <body>.
    requestAnimationFrame(() => {
      const color = toHex(getComputedStyle(document.body).backgroundColor)
      if (color) void SystemColors.setBackground({ color })
    })
  }
  new MutationObserver(apply).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  apply()
  return apply
}

async function boot(): Promise<void> {
  await initSqlite()
  hydrate(DATA_DIR, (await readTree(data, '', (name) => name.startsWith(DB_FILE))).map(([rel, b]) => [`${DATA_DIR}/${rel}`, b]))
  mount(DATA_DIR, persisterFor(DATA_DIR, data))
  const dbBytes = await readBytes(data, DB_FILE)
  if (dbBytes) preloadDb(`${DATA_DIR}/${DB_FILE}`, dbBytes)

  const { getDb } = await import('../main/db')
  const db = getDb() as unknown as { exportDb(): Uint8Array }
  const saveDb = persistDbOnChange(() => db.exportDb())
  if (!dbBytes) await saveDb() // first run: the migrated, seeded DB

  const { registerIpcHandlers } = await import('../main/ipc/handlers')
  registerIpcHandlers()
  installMobileHandlers()
  // No claude CLI on a phone: AI runs with an API key.
  const { loadSettings, saveSettings } = await import('../main/settings')
  if (loadSettings().aiProvider !== 'api') saveSettings({ aiProvider: 'api' })
  const { installMobileSync } = await import('./sync')
  installMobileSync()
  const { installPcLink } = await import('./pcLink')
  installPcLink()

  void App.addListener('backButton', () => {
    if (!window.aopBack?.()) void App.exitApp()
  })
  void App.addListener('pause', () => {
    void saveDb()
    void flushed()
  })

  const { installUploads } = await import('./uploads')
  installUploads()
  const { serveFileUrls } = await import('./fileUrls')
  serveFileUrls()

  const applySystemBars = followThemeInSystemBars()

  await import('../preload/index')
  await import('../renderer/src/main')
  // The phone shell's stylesheet loads with it and sets the page background: match the bars again.
  setTimeout(applySystemBars, 500)
}

boot().catch((error) => {
  console.error('[boot] failed:', error)
  document.body.textContent = `AOP Note를 열 수 없습니다: ${error instanceof Error ? error.message : String(error)}`
})
