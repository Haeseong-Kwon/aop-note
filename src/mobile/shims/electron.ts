// Stand-in for `electron` in the Android build, where the "main process" code runs in the
// same WebView as the UI. IPC becomes an in-page registry: src/main/ipc/handlers.ts registers
// with ipcMain, src/preload/index.ts calls ipcRenderer — both unchanged.

export const UNSUPPORTED = '모바일에서는 지원하지 않는 기능입니다.'

type Handler = (event: unknown, ...args: unknown[]) => unknown
type Listener = (event: unknown, ...args: unknown[]) => void

const handlers = new Map<string, Handler>()
const listeners = new Map<string, Set<Listener>>()

export const ipcMain = {
  handle: (channel: string, fn: Handler): void => {
    handlers.set(channel, fn)
  },
  removeHandler: (channel: string): void => {
    handlers.delete(channel)
  }
}

export const ipcRenderer = {
  // Cloned both ways like Electron's IPC, so neither side shares mutable objects with the other.
  invoke: async (channel: string, ...args: unknown[]): Promise<unknown> => {
    const fn = handlers.get(channel)
    if (!fn) throw new Error(UNSUPPORTED)
    return structuredClone(await fn({}, ...structuredClone(args)))
  },
  on: (channel: string, listener: Listener): void => {
    if (!listeners.has(channel)) listeners.set(channel, new Set())
    listeners.get(channel)!.add(listener)
  },
  removeListener: (channel: string, listener: Listener): void => {
    listeners.get(channel)?.delete(listener)
  }
}

const send = (channel: string, ...args: unknown[]): void => {
  queueMicrotask(() => listeners.get(channel)?.forEach((l) => l({}, ...args)))
}

const theWindow = { webContents: { send }, isDestroyed: (): boolean => false }

export class BrowserWindow {
  static getAllWindows = (): (typeof theWindow)[] => [theWindow]
  static getFocusedWindow = (): typeof theWindow => theWindow
}

export const contextBridge = {
  exposeInMainWorld: (key: string, value: unknown): void => {
    ;(window as unknown as Record<string, unknown>)[key] = value
  }
}

// A picked File has no path on a phone: hand out a virtual one and keep the File until a
// handler needs its bytes (see src/mobile/uploads.ts).
const pickedFiles = new Map<string, File>()
let pickCount = 0
export const webUtils = {
  getPathForFile: (file: File): string => {
    const path = `/tmp/picked/${++pickCount}/${file.name.replace(/[\\/]/g, '_')}`
    pickedFiles.set(path, file)
    return path
  }
}
export const takePickedFile = (path: string): File | undefined => {
  const file = pickedFiles.get(path)
  pickedFiles.delete(path)
  return file
}

/** The registered handler for a channel, to wrap it. */
export const handlerFor = (channel: string): Handler | undefined => handlers.get(channel)

/** Virtual root that the fs shim persists to the app's private storage. */
export const DATA_DIR = '/data'

export const app = {
  getPath: (name: string): string => (name === 'temp' ? '/tmp' : name === 'home' ? '/home' : DATA_DIR),
  getAppPath: (): string => '/app',
  getVersion: (): string => import.meta.env.VITE_APP_VERSION ?? '0.0.0',
  isPackaged: true,
  getLoginItemSettings: (): { openAtLogin: boolean } => ({ openAtLogin: false }),
  setLoginItemSettings: (): void => {},
  isEmojiPanelSupported: (): boolean => false,
  showEmojiPanel: (): void => {}
}

export const shell = {
  openExternal: async (url: string): Promise<void> => {
    window.open(url, '_blank', 'noopener')
  },
  openPath: async (): Promise<string> => UNSUPPORTED,
  showItemInFolder: (): void => {
    throw new Error(UNSUPPORTED)
  }
}

export const clipboard = {
  writeText: (text: string): void => {
    void navigator.clipboard?.writeText(text)
  }
}

export const dialog = {
  showOpenDialog: async (): Promise<never> => {
    throw new Error(UNSUPPORTED)
  },
  showSaveDialog: async (): Promise<never> => {
    throw new Error(UNSUPPORTED)
  },
  showErrorBox: (title: string, message: string): void => {
    console.error(`${title}: ${message}`)
  }
}

export const nativeTheme = { themeSource: 'system', shouldUseDarkColors: matchMedia('(prefers-color-scheme: dark)').matches }

// ponytail: no keystore bridge — the API key is stored as-is in the app's private storage
// (sandboxed from other apps, excluded from backups below). Android Keystore plugin if that's not enough.
export const safeStorage = {
  isEncryptionAvailable: (): boolean => true,
  encryptString: (s: string): Uint8Array => new TextEncoder().encode(s),
  decryptString: (b: Uint8Array): string => new TextDecoder().decode(b)
}

/** Desktop-only modules (tray, menus, global shortcuts...): importable, fail on first use. */
const unsupported = (name: string): never =>
  new Proxy<() => void>(function () {}, {
    get: (_t, prop): unknown => (prop === 'then' ? undefined : unsupported(`${name}.${String(prop)}`)),
    apply: () => {
      throw new Error(`${UNSUPPORTED} (${name})`)
    },
    construct: () => {
      throw new Error(`${UNSUPPORTED} (${name})`)
    }
  }) as never

export const Menu = unsupported('Menu')
export const Tray = unsupported('Tray')
export const globalShortcut = unsupported('globalShortcut')
export const nativeImage = unsupported('nativeImage')
export const Notification = unsupported('Notification')
export const protocol = unsupported('protocol')
export const net = unsupported('net')
