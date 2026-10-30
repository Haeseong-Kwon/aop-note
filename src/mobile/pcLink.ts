import { App } from '@capacitor/app'
import { existsSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'fs'
import { basename, join } from 'path'
import { app, ipcMain } from './shims/electron'
import { flushed } from './shims/fs'
import { onWrite } from './shims/better-sqlite3'
import { IPC } from '@shared/ipc'
import {
  LAN_PATHS,
  LAN_PORT,
  MAX_LAN_FILE_BYTES,
  fresh,
  fromBase64,
  keyFromBase64,
  keyFromCode,
  open,
  seal,
  toBase64,
  type Envelope,
  type FileBody,
  type LanKey,
  type LanPath,
  type PairResponse,
  type Reply,
  type SyncResponse
} from '@shared/lanProtocol'
import { getDb } from '../main/db'
import { attachmentsDir } from '../main/attachmentPaths'
import { deviceId, mergeSnapshot, takeSnapshot, type Snapshot } from '../main/sync'
import { backfillDocumentIndex } from '../main/docText'
import { notifyMerged } from '../main/ipc/handlers'
import type { PcLinkStatus, SyncResult } from '@shared/types'

// The phone side of PC ↔ phone sync (desktop: src/main/lanSync.ts). Paired once with the code the
// desktop shows; afterwards a round runs when the app opens, a few seconds after an edit, every
// minute while open, and as it goes to the background. Rounds that cannot reach the PC (other
// network, PC asleep) fail quietly in the background and loudly from "지금 동기화".

interface Link {
  address: string
  key: string
  pcName: string
  last_sync: string | null
  last_error: string | null
}

const EDIT_DEBOUNCE_MS = 4_000
const INTERVAL_MS = 60_000
const REQUEST_TIMEOUT_MS = 20_000
const FILE_TIMEOUT_MS = 120_000

/** A round's merge is writing (its writes must not schedule another round). */
let merging = false

const linkPath = (): string => join(app.getPath('userData'), 'pc-link.json')

function loadLink(): Link | null {
  try {
    return existsSync(linkPath()) ? (JSON.parse(String(readFileSync(linkPath(), 'utf8'))) as Link) : null
  } catch {
    return null
  }
}

const saveLink = (link: Link): void => writeFileSync(linkPath(), JSON.stringify(link))

const status = (): PcLinkStatus => {
  const link = loadLink()
  return {
    linked: !!link,
    pcName: link?.pcName ?? null,
    address: link?.address ?? null,
    last_sync: link?.last_sync ?? null,
    last_error: link?.last_error ?? null
  }
}

/** "192.168.0.5", "192.168.0.5:47321" or a pasted http:// URL → the server's base URL. */
export function normalizeAddress(input: string): string {
  const bare = input.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '')
  if (!/^[\w.-]+(:\d{1,5})?$/.test(bare)) throw new Error('PC 주소를 확인해 주세요 (예: 192.168.0.12).')
  return `http://${bare.includes(':') ? bare : `${bare}:${LAN_PORT}`}`
}

const UNREACHABLE = 'PC에 연결할 수 없습니다. 휴대폰과 PC가 같은 Wi-Fi인지, PC에서 AOP Note가 켜져 있고 "휴대폰 연결"이 켜져 있는지 확인하세요.'

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return Promise.race([work, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(UNREACHABLE)), ms))])
}

/** POST one sealed request; HTTP failures become messages a person can act on. */
async function post(address: string, path: LanPath, env: Envelope, timeout = REQUEST_TIMEOUT_MS): Promise<Envelope> {
  let res: Response
  try {
    res = await withTimeout(fetch(`${address}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(env) }), timeout)
  } catch {
    throw new Error(UNREACHABLE)
  }
  if (res.ok) return (await res.json()) as Envelope
  if (path === LAN_PATHS.pair && res.status === 401) throw new Error('연결 코드가 맞지 않습니다. 다섯 번 틀리면 PC에서 코드를 새로 띄워야 합니다.')
  if (path === LAN_PATHS.pair && res.status === 403) throw new Error('PC에서 "새 휴대폰 연결"을 눌러 코드를 띄운 뒤 다시 시도하세요 (코드는 10분간 유효).')
  if (res.status === 401) throw new Error('PC에서 이 휴대폰의 연결이 해제되었습니다. 다시 연결해 주세요.')
  if (res.status === 409) throw new Error('휴대폰과 PC의 시계가 5분 넘게 다릅니다. 두 기기에서 날짜·시간 자동 설정을 켜 주세요.')
  throw new Error(`PC가 요청을 처리하지 못했습니다 (${res.status}).`)
}

async function call<T>(link: Link, key: LanKey, path: LanPath, body: unknown, timeout?: number): Promise<T> {
  const request = fresh(body)
  const reply = await open<Reply<T>>(key, path, 'res', await post(link.address, path, await seal(key, deviceId(), path, 'req', request), timeout))
  // Our nonce comes back only in the answer to this request, never in a recorded one.
  if (reply.nonce !== request.nonce) throw new Error('PC의 응답을 확인할 수 없습니다. 다시 시도해 주세요.')
  return reply.body
}

async function pair(input: { address: string; code: string }): Promise<PcLinkStatus> {
  const address = normalizeAddress(String(input.address ?? ''))
  const device = deviceId()
  const codeKey = await keyFromCode(String(input.code ?? ''), device)
  const env = await post(address, LAN_PATHS.pair, await seal(codeKey, device, LAN_PATHS.pair, 'req', { name: phoneName() }))
  const res = await open<PairResponse>(codeKey, LAN_PATHS.pair, 'res', env)
  saveLink({ address, key: res.key, pcName: res.desktop.name, last_sync: null, last_error: null })
  await flushed()
  await syncOnce()
  return status()
}

const phoneName = (): string => {
  const model = navigator.userAgent.match(/Android [\d.]+; ([^;)]+)/)?.[1]?.replace(/ Build\/.*/, '').trim()
  return model ? `${model} (Android)` : 'Android 휴대폰'
}

/** A stored attachment name, never a path (the desktop is trusted, but a name still must not escape the folder). */
const isPlainName = (name: string): boolean => !!name && name === basename(name) && !name.startsWith('.')

const localFiles = (): string[] => readdirSync(attachmentsDir()).filter((n) => !n.startsWith('.'))

/** One round: our snapshot up, theirs back and merged, then the files either side lacks. */
async function round(link: Link): Promise<SyncResult> {
  const key = await keyFromBase64(link.key)
  const res = await call<SyncResponse>(link, key, LAN_PATHS.sync, { snapshot: takeSnapshot(deviceId()), files: localFiles() })
  // The merge's own writes must not schedule another round (edits made meanwhile still do).
  merging = true
  let merged: number
  try {
    merged = mergeSnapshot(res.snapshot as Snapshot)
  } finally {
    merging = false
  }

  const referenced = new Set(getDb().prepare('SELECT stored_name FROM attachments').pluck().all() as string[])
  const mine = new Set(localFiles())
  const theirs = new Set(res.files)
  let files = 0
  for (const name of theirs) {
    if (mine.has(name) || !referenced.has(name) || !isPlainName(name)) continue
    const file = await call<FileBody>(link, key, LAN_PATHS.fileGet, { name }, FILE_TIMEOUT_MS).catch((error: unknown) => {
      console.error(`[pc] could not fetch ${name}:`, error)
      return null
    })
    if (!file || file.name !== name) continue
    writeFileSync(join(attachmentsDir(), name), fromBase64(file.data))
    files++
  }
  for (const name of mine) {
    if (theirs.has(name) || !referenced.has(name)) continue
    const bytes = readFileSync(join(attachmentsDir(), name)) as Uint8Array
    if (bytes.length > MAX_LAN_FILE_BYTES) continue
    await call(link, key, LAN_PATHS.filePut, { name, data: toBase64(bytes) }, FILE_TIMEOUT_MS)
    files++
  }
  if (files > 0) void backfillDocumentIndex().catch((error) => console.error('[pc] index failed:', error))
  if (merged > 0 || files > 0) notifyMerged()
  return { exported: true, merged, devices: 1, files }
}

let running: Promise<SyncResult> | null = null

/** One round at a time (a running one is shared); the outcome is remembered for Settings. */
function syncOnce(): Promise<SyncResult> {
  const link = loadLink()
  if (!link) return Promise.reject(new Error('연결된 PC가 없습니다.'))
  running ??= (async () => {
    try {
      const result = await round(link)
      saveLink({ ...(loadLink() ?? link), last_sync: new Date().toISOString(), last_error: null })
      return result
    } catch (error) {
      const current = loadLink()
      if (current) saveLink({ ...current, last_error: error instanceof Error ? error.message : String(error) })
      throw error
    } finally {
      running = null
      await flushed()
    }
  })()
  return running
}

const background = (): void => {
  if (!loadLink() || document.visibilityState !== 'visible') return
  syncOnce().catch((error) => console.warn('[pc] sync skipped:', error instanceof Error ? error.message : error))
}

export function installPcLink(): void {
  ipcMain.handle(IPC.pcLink.status, () => status())
  ipcMain.handle(IPC.pcLink.link, (_e: unknown, input: unknown) => pair(input as { address: string; code: string }))
  ipcMain.handle(IPC.pcLink.syncNow, () => syncOnce())
  ipcMain.handle(IPC.pcLink.unlink, async () => {
    rmSync(linkPath(), { force: true })
    await flushed()
    return status()
  })

  let edit: ReturnType<typeof setTimeout> | null = null
  onWrite(() => {
    if (merging || !loadLink()) return
    if (edit) clearTimeout(edit)
    edit = setTimeout(background, EDIT_DEBOUNCE_MS)
  })
  setInterval(background, INTERVAL_MS)
  document.addEventListener('visibilitychange', background)
  // Leaving the app: push what was just written while the PC can still be reached.
  void App.addListener('pause', () => {
    if (loadLink()) syncOnce().catch(() => {})
  })
  background()
}
