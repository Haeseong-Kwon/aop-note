// Node built-ins that main-process code imports but the Android build cannot provide
// (processes, DNS, the updater). Importing works; calling fails with a clear message.
import { UNSUPPORTED } from './electron'

const unsupported = (): never => {
  throw new Error(UNSUPPORTED)
}

// child_process
export const spawn = unsupported
export const execFile = unsupported
export const execFileSync = unsupported

// os
export const homedir = (): string => '/home'
export const tmpdir = (): string => '/tmp'

// url
export const pathToFileURL = (path: string): URL => new URL(`file://${path}`)

// node:net, node:dns/promises — link previews resolve hosts to block private addresses; without DNS they refuse.
export const isIP = (s: string): number => (/^\d{1,3}(\.\d{1,3}){3}$/.test(s) ? 4 : s.includes(':') ? 6 : 0)
export const lookup = async (): Promise<never> => unsupported()

// crypto
export const randomUUID = (): string => crypto.randomUUID()

// electron-updater
export const autoUpdater = new Proxy({}, { get: () => unsupported })

export default {}
