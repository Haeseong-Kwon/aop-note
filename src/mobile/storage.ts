import { Directory, Filesystem } from '@capacitor/filesystem'
import type { Persister } from './shims/fs'

// Real storage behind the in-memory fs: the app's private data dir, or an absolute
// folder on shared storage (the Syncthing folder used for device sync).

/** Where a virtual root lives: relative paths under `directory`, or absolute `file://` paths. */
export interface Location {
  directory?: Directory
  base: string
}

const target = (loc: Location, rel: string): { path: string; directory?: Directory } =>
  loc.directory ? { path: rel, directory: loc.directory } : { path: `file://${loc.base}/${rel}` }

const CHUNK = 0x8000

export function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += CHUNK) s += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  return btoa(s)
}

export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

export async function readBytes(loc: Location, rel: string): Promise<Uint8Array | null> {
  try {
    const { data } = await Filesystem.readFile(target(loc, rel))
    return typeof data === 'string' ? fromBase64(data) : new Uint8Array(await data.arrayBuffer())
  } catch {
    return null // missing file
  }
}

/** Write via a temp file + rename so a crash never leaves a half-written file. */
export async function writeBytes(loc: Location, rel: string, bytes: Uint8Array): Promise<void> {
  const tmp = `${rel}.tmp`
  await Filesystem.writeFile({ ...target(loc, tmp), data: toBase64(bytes), recursive: true })
  const from = target(loc, tmp)
  const to = target(loc, rel)
  const rename = (): Promise<void> =>
    Filesystem.rename({ from: from.path, to: to.path, directory: from.directory, toDirectory: to.directory })
  // Some Android paths refuse to rename onto an existing file: clear it and retry once.
  await rename().catch(async () => {
    await Filesystem.deleteFile(to).catch(() => undefined)
    await rename()
  })
}

/** Every file under `rel` (recursive), as [path relative to the location, bytes]. */
export async function readTree(loc: Location, rel = '', skip: (name: string) => boolean = () => false): Promise<[string, Uint8Array][]> {
  let entries: { name: string; type: string }[]
  try {
    entries = (await Filesystem.readdir(target(loc, rel))).files
  } catch {
    return [] // folder not there (yet)
  }
  const out: [string, Uint8Array][] = []
  for (const e of entries) {
    const path = rel ? `${rel}/${e.name}` : e.name
    if (skip(e.name) || e.name.endsWith('.tmp')) continue
    if (e.type === 'directory') out.push(...(await readTree(loc, path, skip)))
    else {
      const bytes = await readBytes(loc, path)
      if (bytes) out.push([path, bytes])
    }
  }
  return out
}

/** Persister for the virtual root `root` (an absolute path in the fs shim) stored at `loc`. */
export function persisterFor(root: string, loc: Location): Persister {
  const rel = (path: string): string => path.slice(root.length + 1)
  return {
    write: (path, data) => writeBytes(loc, rel(path), data),
    remove: async (path) => {
      await Filesystem.deleteFile(target(loc, rel(path))).catch(() => undefined) // already gone is fine
    }
  }
}
