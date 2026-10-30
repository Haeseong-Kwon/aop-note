import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import { networkInterfaces, hostname } from 'os'
import { join, basename } from 'path'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs'
import { app, ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import { saveSettings } from './settings'
import { getDb } from './db'
import { attachmentsDir } from './attachmentPaths'
import { deviceId, mergeSnapshot, takeSnapshot, type Snapshot } from './sync'
import { backfillDocumentIndex } from './docText'
import {
  LAN_PATHS,
  LAN_PORT,
  MAX_LAN_FILE_BYTES,
  FRESH_MS,
  fromBase64,
  isEnvelope,
  keyFromBase64,
  keyFromCode,
  newDeviceKey,
  newPairingCode,
  open,
  seal,
  toBase64,
  type Envelope,
  type Fresh,
  type Reply,
  type FileBody,
  type FileGetRequest,
  type LanKey,
  type LanPath,
  type PairRequest,
  type PairResponse,
  type SyncRequest,
  type SyncResponse
} from '@shared/lanProtocol'
import type { LanStatus } from '@shared/types'

// The desktop side of PC ↔ phone sync: an HTTP server on the local network that phones paired
// with a one-time code talk to (protocol and crypto: src/shared/lanProtocol.ts). A phone's round
// sends its snapshot, gets ours back after the merge, then swaps the attachment files either side lacks.
// ponytail: the phone keeps the address it paired with; a desktop whose LAN IP changes is re-entered
// on the phone. mDNS discovery if that becomes a chore.

const PAIRING_MS = 10 * 60_000
const MAX_PAIR_FAILURES = 5
/** Request size per endpoint, checked while reading: only an upload may be large. */
const MAX_BODY_BYTES: Record<LanPath, number> = {
  [LAN_PATHS.pair]: 16 * 1024,
  [LAN_PATHS.fileGet]: 16 * 1024,
  [LAN_PATHS.sync]: 64 * 1024 * 1024,
  [LAN_PATHS.filePut]: Math.ceil(MAX_LAN_FILE_BYTES * 1.4) + 1024 * 1024 // base64 + envelope
}
/** One phone needs one connection at a time; a few spare for several phones. */
const MAX_CONNECTIONS = 8
const HEADERS_TIMEOUT_MS = 10_000
/** Long enough for the largest file on a slow Wi-Fi. */
const REQUEST_TIMEOUT_MS = 5 * 60_000

interface PairedDevice {
  id: string
  name: string
  key: string
  paired_at: string
  last_seen: string | null
}

const devicesPath = (): string => join(app.getPath('userData'), 'lan-devices.json')

function loadDevices(): PairedDevice[] {
  try {
    const list = JSON.parse(readFileSync(devicesPath(), 'utf8')) as PairedDevice[]
    return Array.isArray(list) ? list.filter((d) => typeof d.id === 'string' && typeof d.key === 'string') : []
  } catch {
    return [] // none yet, or an unreadable file: phones pair again
  }
}

const saveDevices = (list: PairedDevice[]): void => writeFileSync(devicesPath(), JSON.stringify(list, null, 2), { mode: 0o600 })

let server: Server | null = null
let listenError: string | null = null
let pairing: { code: string; expires: number; failures: number } | null = null
let onMerged: () => void = () => {}
/** Nonces seen within the freshness window → when they may be forgotten. */
const seen = new Map<string, number>()

/** How the phone names this computer: the host name without the mDNS suffix macOS adds. */
const computerName = (): string => hostname().replace(/\.(local|lan|home)$/i, '') || '내 컴퓨터'

/** IPv4 addresses a phone on the same network can reach this machine at. */
function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => a!.address)
}

export function lanStatus(): LanStatus {
  const live = pairing && pairing.expires > Date.now() ? pairing : null
  return {
    enabled: server !== null,
    error: listenError,
    port: LAN_PORT,
    addresses: lanAddresses(),
    pairing: live ? { code: live.code, expires_at: new Date(live.expires).toISOString() } : null,
    devices: loadDevices().map(({ id, name, paired_at, last_seen }) => ({ id, name, paired_at, last_seen }))
  }
}

export function startPairing(): LanStatus {
  pairing = { code: newPairingCode(), expires: Date.now() + PAIRING_MS, failures: 0 }
  return lanStatus()
}

export function forgetDevice(id: string): LanStatus {
  saveDevices(loadDevices().filter((d) => d.id !== id))
  return lanStatus()
}

// ---- requests ----

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
  }
}

function readBody(req: IncomingMessage, limit: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (Number(req.headers['content-length'] ?? 0) > limit) {
      reject(new HttpError(413, 'too large'))
      return
    }
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > limit) {
        reject(new HttpError(413, 'too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new HttpError(400, 'bad json'))
      }
    })
    req.on('error', reject)
  })
}

/** A stored attachment name: no paths, nothing hidden (the same rule as the folder sync). */
const safeName = (name: unknown): string => {
  if (typeof name !== 'string' || !name || name !== basename(name) || name.startsWith('.')) throw new HttpError(400, 'bad name')
  return name
}

const referencedFiles = (): Set<string> => new Set(getDb().prepare('SELECT stored_name FROM attachments').pluck().all() as string[])

const localFiles = (): string[] => {
  const dir = attachmentsDir()
  return existsSync(dir) ? readdirSync(dir).filter((n) => !n.startsWith('.')) : []
}

/** Returns the response with the code's key, which seals it (the code itself is spent). */
async function pair(env: Envelope): Promise<{ codeKey: LanKey; response: PairResponse }> {
  const attempt = pairing
  if (!attempt || attempt.expires <= Date.now()) throw new HttpError(403, 'not pairing')
  // Counted before the (slow) key derivation, so parallel guesses cannot exceed the limit.
  if (++attempt.failures > MAX_PAIR_FAILURES) {
    pairing = null
    throw new HttpError(403, 'not pairing')
  }
  const codeKey = await keyFromCode(attempt.code, env.device)
  let body: PairRequest
  try {
    body = await open<PairRequest>(codeKey, LAN_PATHS.pair, 'req', env)
  } catch {
    // Wrong code. A few tries, then the code is gone and has to be shown again.
    if (attempt.failures >= MAX_PAIR_FAILURES && pairing === attempt) pairing = null
    throw new HttpError(401, 'wrong code')
  }
  if (pairing !== attempt) throw new HttpError(403, 'not pairing') // spent or replaced meanwhile
  pairing = null // one code, one phone
  const device: PairedDevice = {
    id: env.device,
    name: String(body.name ?? '').slice(0, 60) || '휴대폰',
    key: newDeviceKey(),
    paired_at: new Date().toISOString(),
    last_seen: null
  }
  saveDevices([...loadDevices().filter((d) => d.id !== device.id), device])
  return { codeKey, response: { key: device.key, desktop: { id: deviceId(), name: computerName() } } }
}

function sync(body: SyncRequest): SyncResponse {
  const snap = body.snapshot as Snapshot
  if (!snap || typeof snap !== 'object' || !snap.tables) throw new HttpError(400, 'bad snapshot')
  const merged = mergeSnapshot(snap)
  if (merged > 0) onMerged()
  return { snapshot: takeSnapshot(deviceId()), files: localFiles(), merged }
}

function fileGet(body: FileGetRequest): FileBody {
  const name = safeName(body.name)
  const path = join(attachmentsDir(), name)
  if (!referencedFiles().has(name) || !existsSync(path)) throw new HttpError(404, 'no such file')
  if (statSync(path).size > MAX_LAN_FILE_BYTES) throw new HttpError(413, 'too large')
  return { name, data: toBase64(readFileSync(path)) }
}

function filePut(body: FileBody): { ok: true } {
  const name = safeName(body.name)
  // Only files a synced attachment row points at; never overwrite one we already have.
  if (!referencedFiles().has(name)) throw new HttpError(404, 'unknown file')
  const bytes = fromBase64(String(body.data))
  if (bytes.length > MAX_LAN_FILE_BYTES) throw new HttpError(413, 'too large')
  const path = join(attachmentsDir(), name)
  if (!existsSync(path)) {
    writeFileSync(path, bytes)
    void backfillDocumentIndex().catch((error) => console.error('[lan] index failed:', error))
  }
  return { ok: true }
}

async function handle(path: LanPath, env: Envelope): Promise<Envelope> {
  if (path === LAN_PATHS.pair) {
    const { codeKey, response } = await pair(env)
    return seal(codeKey, deviceId(), path, 'res', response)
  }
  // One reason for every refusal: a caller learns nothing about which devices are paired.
  const devices = loadDevices()
  const device = devices.find((d) => d.id === env.device)
  if (!device) throw new HttpError(401, 'unauthorized')
  const key = await keyFromBase64(device.key)
  let request: Fresh<unknown>
  try {
    request = await open<Fresh<unknown>>(key, path, 'req', env)
  } catch {
    throw new HttpError(401, 'unauthorized')
  }
  const body = checkFresh(request)
  const result =
    path === LAN_PATHS.sync
      ? sync(body as SyncRequest)
      : path === LAN_PATHS.fileGet
        ? fileGet(body as FileGetRequest)
        : filePut(body as FileBody)
  saveDevices(devices.map((d) => (d.id === device.id ? { ...d, last_seen: new Date().toISOString() } : d)))
  const reply: Reply<unknown> = { nonce: request.nonce, body: result }
  return seal(key, deviceId(), path, 'res', reply)
}

/** Refuses a request from outside the time window or seen before (a replay). */
function checkFresh(request: Fresh<unknown>): unknown {
  const now = Date.now()
  for (const [nonce, until] of seen) if (until < now) seen.delete(nonce)
  if (typeof request.ts !== 'number' || Math.abs(now - request.ts) > FRESH_MS) throw new HttpError(409, 'clock')
  if (typeof request.nonce !== 'string' || seen.has(request.nonce)) throw new HttpError(401, 'unauthorized')
  seen.set(request.nonce, now + 2 * FRESH_MS)
  return request.body
}

const PATHS = new Set<string>(Object.values(LAN_PATHS))

async function respond(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    if (req.method !== 'POST' || !PATHS.has(req.url ?? '')) throw new HttpError(404, 'not found')
    const env = await readBody(req, MAX_BODY_BYTES[req.url as LanPath])
    if (!isEnvelope(env)) throw new HttpError(400, 'bad envelope')
    const out = await handle(req.url as LanPath, env)
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(out))
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500
    if (status === 500) console.error('[lan] request failed:', error)
    // Short, fixed reasons only: nothing about the data leaks to an unpaired caller.
    res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify({ error: error instanceof HttpError ? error.message : 'failed' }))
  }
}

/** Listen on the LAN (port 0 = any free port, for tests). Resolves once listening or failed. */
export function startLanServer(merged: () => void, port = LAN_PORT): Promise<LanStatus> {
  onMerged = merged
  if (server) return Promise.resolve(lanStatus())
  return new Promise((resolve) => {
    const s = createServer({ headersTimeout: HEADERS_TIMEOUT_MS, requestTimeout: REQUEST_TIMEOUT_MS }, (req, res) => void respond(req, res))
    s.maxConnections = MAX_CONNECTIONS
    s.once('error', (error: NodeJS.ErrnoException) => {
      listenError = error.code === 'EADDRINUSE' ? `포트 ${port}을(를) 다른 프로그램이 쓰고 있습니다.` : error.message
      server = null
      resolve(lanStatus())
    })
    s.listen(port, '0.0.0.0', () => {
      server = s
      listenError = null
      resolve(lanStatus())
    })
  })
}

export function stopLanServer(): LanStatus {
  server?.close()
  server = null
  pairing = null
  return lanStatus()
}

/** The port actually bound (differs from LAN_PORT only in tests). */
export const lanPort = (): number => {
  const addr = server?.address()
  return addr && typeof addr === 'object' ? addr.port : LAN_PORT
}

/** Settings → 휴대폰 연결. The server's on/off state is remembered (settings.lanSync). */
export function registerLanHandlers(merged: () => void): void {
  const handle = (channel: string, fn: (...args: never[]) => unknown): void => {
    ipcMain.handle(channel, async (_e, ...args) => {
      try {
        return await fn(...(args as never[]))
      } catch (error) {
        console.error(`[ipc] ${channel} failed:`, error)
        throw error
      }
    })
  }
  handle(IPC.lan.status, () => lanStatus())
  handle(IPC.lan.enable, async () => {
    saveSettings({ lanSync: true })
    return startLanServer(merged)
  })
  handle(IPC.lan.disable, () => {
    saveSettings({ lanSync: false })
    return stopLanServer()
  })
  handle(IPC.lan.startPairing, () => {
    if (!server) throw new Error('휴대폰 연결이 꺼져 있습니다.')
    return startPairing()
  })
  handle(IPC.lan.forget, (id: string) => forgetDevice(String(id)))
}
