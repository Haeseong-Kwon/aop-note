// Stand-in for the `electron` module when main-process code runs under plain
// Node (ELECTRON_RUN_AS_NODE) in checks: userData becomes a throwaway temp dir.
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const userData = mkdtempSync(join(tmpdir(), 'aop-note-check-'))

export const app = { getPath: (): string => userData }

// UI-bound APIs must not be reached from checks; fail loudly if they are.
const unavailable = (name: string): never => {
  throw new Error(`electron.${name} is not available in checks`)
}
export const dialog = new Proxy({}, { get: (_t, p) => () => unavailable(`dialog.${String(p)}`) })
export const shell = new Proxy({}, { get: (_t, p) => () => unavailable(`shell.${String(p)}`) })
export class BrowserWindow {}

// Test-only stand-in for the OS keychain: reversible, clearly not encryption.
export const safeStorage = {
  isEncryptionAvailable: (): boolean => true,
  encryptString: (s: string): Buffer => Buffer.from(`test:${s}`),
  decryptString: (b: Buffer): string => b.toString().replace(/^test:/, '')
}
