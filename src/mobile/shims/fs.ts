import { posix } from 'path-browserify'

// Synchronous in-memory file system standing in for `fs` in the Android build, so main-process
// code (settings, device id, attachments, folder sync) runs unchanged. Each `mount` is a
// directory backed by real storage: loaded with `hydrate`, written behind through its Persister.
//
// ponytail: every persisted file is held in memory; fine for notes + modest attachments.
// Lazy reads through an async fs if attachment volume grows.

export interface Persister {
  write(path: string, data: Uint8Array): Promise<void>
  remove(path: string): Promise<void>
}

const files = new Map<string, Uint8Array>()
const dirs = new Set<string>(['/'])
const mounts: { root: string; persister: Persister }[] = []
let queue: Promise<void> = Promise.resolve()

const norm = (p: string): string => posix.resolve('/', String(p))

const fail = (code: string, op: string, path: string): never => {
  const error = new Error(`${code}: ${op} '${path}'`) as Error & { code: string }
  error.code = code
  throw error
}

/** Serialize write-behind so storage ends in the same order as memory. Errors are logged, not lost silently. */
function persist(op: (p: Persister) => Promise<void>, path: string): void {
  const m = mounts.find(({ root }) => path.startsWith(`${root}/`))
  // Callers stage "x.tmp" then rename it onto "x"; storage writes are already atomic, so only "x" goes out.
  if (!m || path.endsWith('.tmp')) return
  queue = queue.then(() => op(m.persister)).catch((error) => console.error('[fs] persist failed:', path, error))
}

/** Resolves once every queued write has reached storage. */
export const flushed = (): Promise<void> => queue

/** Back `root` with real storage; replaces an earlier mount of the same root. */
export function mount(root: string, persister: Persister): void {
  const abs = norm(root)
  const i = mounts.findIndex((m) => m.root === abs)
  if (i >= 0) mounts.splice(i, 1)
  mounts.push({ root: abs, persister })
  mkdirSync(abs, { recursive: true })
}

/** Make memory under `dir` match what storage holds (no write-back): files gone from storage go here too. */
export function hydrate(dir: string, entries: Iterable<[string, Uint8Array]>): void {
  const prefix = `${norm(dir)}/`
  for (const p of [...files.keys()]) if (p.startsWith(prefix)) files.delete(p)
  mkdirSync(dir, { recursive: true })
  for (const [path, data] of entries) {
    const abs = norm(path)
    mkdirSync(posix.dirname(abs), { recursive: true })
    files.set(abs, data)
  }
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

const toBytes = (data: unknown): Uint8Array => {
  if (typeof data === 'string') return encoder.encode(data)
  if (data instanceof ArrayBuffer) return new Uint8Array(data.slice(0))
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
  return fail('EINVAL', 'write', String(data))
}

const encodingOf = (options: unknown): string | undefined =>
  typeof options === 'string' ? options : (options as { encoding?: string } | undefined)?.encoding

export function existsSync(path: string): boolean {
  const abs = norm(path)
  return files.has(abs) || dirs.has(abs)
}

export function mkdirSync(path: string, options?: { recursive?: boolean }): void {
  const abs = norm(path)
  if (dirs.has(abs)) return
  const parent = posix.dirname(abs)
  if (!dirs.has(parent)) {
    if (!options?.recursive) fail('ENOENT', 'mkdir', abs)
    mkdirSync(parent, options)
  }
  if (files.has(abs)) fail('EEXIST', 'mkdir', abs)
  dirs.add(abs)
}

export function readFileSync(path: string, options?: unknown): string | Uint8Array {
  const data = files.get(norm(path)) ?? fail('ENOENT', 'open', norm(path))
  if (encodingOf(options)) return decoder.decode(data)
  return typeof Buffer !== 'undefined' ? Buffer.from(data) : data
}

export function writeFileSync(path: string, data: unknown): void {
  const abs = norm(path)
  if (!dirs.has(posix.dirname(abs))) fail('ENOENT', 'open', abs)
  if (dirs.has(abs)) fail('EISDIR', 'open', abs)
  const bytes = toBytes(data)
  files.set(abs, bytes)
  persist((p) => p.write(abs, bytes), abs)
}

export function readdirSync(path: string): string[] {
  const abs = norm(path)
  if (!dirs.has(abs)) fail('ENOENT', 'scandir', abs)
  const prefix = abs === '/' ? '/' : `${abs}/`
  const names = new Set<string>()
  for (const p of [...files.keys(), ...dirs]) {
    if (p.startsWith(prefix) && p !== abs) names.add(p.slice(prefix.length).split('/')[0])
  }
  return [...names].sort()
}

interface Stats {
  size: number
  mtimeMs: number
  mtime: Date
  isFile(): boolean
  isDirectory(): boolean
}

export function statSync(path: string): Stats {
  const abs = norm(path)
  const data = files.get(abs)
  if (!data && !dirs.has(abs)) fail('ENOENT', 'stat', abs)
  return {
    size: data?.byteLength ?? 0,
    mtimeMs: 0,
    mtime: new Date(0),
    isFile: () => !!data,
    isDirectory: () => !data
  }
}

export function copyFileSync(from: string, to: string): void {
  writeFileSync(to, files.get(norm(from)) ?? fail('ENOENT', 'copyfile', norm(from)))
}

export function renameSync(from: string, to: string): void {
  const src = norm(from)
  const data = files.get(src)
  if (!data) return fail('ENOENT', 'rename', src)
  writeFileSync(to, data)
  rmSync(src)
}

export function rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void {
  const abs = norm(path)
  if (files.delete(abs)) {
    persist((p) => p.remove(abs), abs)
    return
  }
  if (!dirs.has(abs)) {
    if (!options?.force) fail('ENOENT', 'rm', abs)
    return
  }
  if (!options?.recursive && readdirSync(abs).length > 0) fail('ENOTEMPTY', 'rm', abs)
  for (const name of readdirSync(abs)) rmSync(posix.join(abs, name), { recursive: true, force: true })
  dirs.delete(abs)
}

export const rmdirSync = (path: string): void => rmSync(path)

export function cpSync(from: string, to: string, options?: { recursive?: boolean }): void {
  const src = norm(from)
  if (files.has(src)) return copyFileSync(src, to)
  mkdirSync(to, { recursive: true })
  if (!options?.recursive) return
  for (const name of readdirSync(src)) cpSync(posix.join(src, name), posix.join(norm(to), name), options)
}

export const realpathSync = (path: string): string => norm(path)

let tempCounter = 0
export function mkdtempSync(prefix: string): string {
  const dir = `${norm(prefix)}${Date.now().toString(36)}${tempCounter++}`
  mkdirSync(dir, { recursive: true })
  return dir
}

export function watch(): { close(): void } {
  return { close: () => {} }
}

export function symlinkSync(): never {
  return fail('ENOSYS', 'symlink', '')
}

export const promises = {
  readFile: async (path: string, options?: unknown): Promise<string | Uint8Array> => readFileSync(path, options),
  writeFile: async (path: string, data: unknown): Promise<void> => writeFileSync(path, data),
  unlink: async (path: string): Promise<void> => rmSync(path)
}

export default {
  existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, copyFileSync, renameSync,
  rmSync, rmdirSync, cpSync, realpathSync, mkdtempSync, watch, symlinkSync, promises
}
