// PC ↔ phone sync over the local network (desktop: src/main/lanSync.ts, phone: src/mobile/pcLink.ts).
// Every body is AES-256-GCM sealed with the key the two devices agreed on when pairing, so the
// plain-HTTP transport (no certificates on a LAN) carries nothing readable or forgeable.
// Pairing itself is sealed with a key stretched from the one-time code shown on the desktop.
// WebCrypto only: the same code runs in Electron's main process (Node) and the Android WebView.

export const LAN_PORT = 47321
export const LAN_PATHS = { pair: '/pair', sync: '/sync', fileGet: '/file/get', filePut: '/file/put' } as const
export type LanPath = (typeof LAN_PATHS)[keyof typeof LAN_PATHS]

/** Largest attachment moved over the LAN (the whole file is held in memory on the phone). */
export const MAX_LAN_FILE_BYTES = 100 * 1024 * 1024

/** Pairing codes: 12 symbols without look-alikes (0/O, 1/I/L) = 60 bits, shown as XXXX-XXXX-XXXX. */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
const CODE_LENGTH = 12
const PBKDF2_ITERATIONS = 210_000

/** What travels on the wire: which device is talking, and the sealed body. */
export interface Envelope {
  device: string
  iv: string
  data: string
}

// Types taken from globalThis.crypto: the DOM lib (renderer) and @types/node (main) both declare it.
type Subtle = typeof globalThis.crypto.subtle
export type LanKey = Awaited<ReturnType<Subtle['importKey']>>

const subtle = (): Subtle => globalThis.crypto.subtle
const enc = new TextEncoder()
const dec = new TextDecoder()

export function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

export function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

export function newPairingCode(): string {
  // Bytes past the last whole multiple of the alphabet are dropped, so every symbol is equally likely.
  const limit = 256 - (256 % CODE_ALPHABET.length)
  let raw = ''
  while (raw.length < CODE_LENGTH) {
    for (const b of globalThis.crypto.getRandomValues(new Uint8Array(CODE_LENGTH))) {
      if (b < limit && raw.length < CODE_LENGTH) raw += CODE_ALPHABET[b % CODE_ALPHABET.length]
    }
  }
  return raw.match(/.{4}/g)!.join('-')
}

/** Accepts the code however it was typed: lower case, spaces, with or without dashes. */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^0-9A-Z]/g, '')
}

export function newDeviceKey(): string {
  return toBase64(globalThis.crypto.getRandomValues(new Uint8Array(32)))
}

const importKey = (raw: Uint8Array<ArrayBuffer>): Promise<LanKey> => subtle().importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])

export const keyFromBase64 = (b64: string): Promise<LanKey> => importKey(fromBase64(b64))

/** The pairing key: the code stretched with PBKDF2, salted per phone so one guess covers one device. */
export async function keyFromCode(code: string, device: string): Promise<LanKey> {
  const base = await subtle().importKey('raw', enc.encode(normalizeCode(code)), 'PBKDF2', false, ['deriveKey'])
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(`aop-note-pair:${device}`), iterations: PBKDF2_ITERATIONS },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/** Bound to the endpoint and direction, so a sealed body cannot be replayed as another request. */
const aad = (path: LanPath, direction: 'req' | 'res'): Uint8Array<ArrayBuffer> => enc.encode(`aop-note:${path}:${direction}`)

export async function seal(key: LanKey, device: string, path: LanPath, direction: 'req' | 'res', body: unknown): Promise<Envelope> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12))
  const data = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: aad(path, direction) }, key, enc.encode(JSON.stringify(body)))
  return { device, iv: toBase64(iv), data: toBase64(new Uint8Array(data)) }
}

/** Throws when the key is wrong or anything was altered. */
export async function open<T>(key: LanKey, path: LanPath, direction: 'req' | 'res', env: Envelope): Promise<T> {
  const plain = await subtle().decrypt(
    { name: 'AES-GCM', iv: fromBase64(env.iv), additionalData: aad(path, direction) },
    key,
    fromBase64(env.data)
  )
  return JSON.parse(dec.decode(plain)) as T
}

export function isEnvelope(v: unknown): v is Envelope {
  const e = v as Envelope
  return !!e && typeof e.device === 'string' && typeof e.iv === 'string' && typeof e.data === 'string' && e.device.length <= 64
}

// ---- freshness ----
// Requests carry a time and a random nonce; the desktop refuses old or repeated ones, and echoes
// the nonce so the phone can tell its reply from a recorded one.

/** How far apart the phone's and the desktop's clocks (and a request's age) may be. */
export const FRESH_MS = 5 * 60_000

export interface Fresh<T> {
  ts: number
  nonce: string
  body: T
}
export interface Reply<T> {
  nonce: string
  body: T
}

export const fresh = <T>(body: T): Fresh<T> => ({
  ts: Date.now(),
  nonce: toBase64(globalThis.crypto.getRandomValues(new Uint8Array(16))),
  body
})

// ---- request / response bodies ----

export interface PairRequest {
  name: string
}
export interface PairResponse {
  key: string
  desktop: { id: string; name: string }
}
export interface SyncRequest {
  snapshot: unknown
  /** Attachment files (stored names) the phone has. */
  files: string[]
}
export interface SyncResponse {
  snapshot: unknown
  /** Attachment files the desktop has. */
  files: string[]
  merged: number
}
export interface FileGetRequest {
  name: string
}
export interface FileBody {
  name: string
  data: string
}
