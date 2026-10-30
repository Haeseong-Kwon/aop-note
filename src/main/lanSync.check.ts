import assert from 'node:assert'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { forgetDevice, lanPort, lanStatus, startLanServer, startPairing, stopLanServer } from './lanSync'
import { takeSnapshot, type Snapshot } from './sync'
import { workspaceRepo } from './repositories/workspace.repo'
import { categoryRepo } from './repositories/category.repo'
import { taskRepo } from './repositories/task.repo'
import { attachmentRepo } from './repositories/attachment.repo'
import { attachmentsDir } from './attachmentPaths'
import {
  LAN_PATHS,
  keyFromBase64,
  keyFromCode,
  open,
  seal,
  toBase64,
  fromBase64,
  fresh,
  type Envelope,
  type Reply,
  type FileBody,
  type LanKey,
  type LanPath,
  type PairResponse,
  type SyncResponse
} from '@shared/lanProtocol'

// Plays the phone against the real desktop server on a free port.

const PHONE = 'phone-check-device'

async function post(path: LanPath, env: Envelope): Promise<{ status: number; body: Envelope }> {
  const res = await fetch(`http://127.0.0.1:${lanPort()}${path}`, { method: 'POST', body: JSON.stringify(env) })
  return { status: res.status, body: (await res.json()) as Envelope }
}

async function call<T>(key: LanKey, path: LanPath, body: unknown, device = PHONE): Promise<{ status: number; result?: T }> {
  // Pairing is sealed with the code alone; every later request carries time + nonce.
  const request = path === LAN_PATHS.pair ? body : fresh(body)
  const { status, body: env } = await post(path, await seal(key, device, path, 'req', request))
  if (status !== 200) return { status }
  const opened = await open<T | Reply<T>>(key, path, 'res', env)
  if (path === LAN_PATHS.pair) return { status, result: opened as T }
  assert.equal((opened as Reply<T>).nonce, (request as { nonce: string }).nonce, 'reply echoes the request nonce')
  return { status, result: (opened as Reply<T>).body }
}

async function main(): Promise<void> {
  let merges = 0
  await startLanServer(() => merges++, 0)
  assert.ok(lanStatus().enabled, 'server listening')

  // Not pairing: the pair endpoint is closed, even with a right-looking code.
  const guess = await keyFromCode('AAAA-BBBB-CCCC', PHONE)
  assert.equal((await call(guess, LAN_PATHS.pair, { name: 'x' })).status, 403, 'pairing closed until a code is shown')

  // Wrong codes: five strikes and the code is gone.
  const { pairing } = startPairing()
  assert.ok(pairing && /^[2-9A-Z]{4}-[2-9A-Z]{4}-[2-9A-Z]{4}$/.test(pairing.code), `code shape (${pairing?.code})`)
  for (let i = 0; i < 5; i++) assert.equal((await call(guess, LAN_PATHS.pair, { name: 'x' })).status, 401, 'wrong code refused')
  assert.equal(lanStatus().pairing, null, 'code withdrawn after repeated wrong guesses')

  // Right code (typed loosely): the phone gets its own key, sealed with the code.
  const code = startPairing().pairing!.code
  const paired = await call<PairResponse>(await keyFromCode(code.toLowerCase().replace(/-/g, ' '), PHONE), LAN_PATHS.pair, { name: '테스트 폰' })
  assert.equal(paired.status, 200, 'paired')
  assert.equal(lanStatus().devices[0]?.name, '테스트 폰', 'device listed')
  assert.equal(lanStatus().pairing, null, 'a code pairs one phone only')
  const key = await keyFromBase64(paired.result!.key)

  // Strangers and tampering are refused.
  assert.equal((await call(key, LAN_PATHS.sync, {}, 'someone-else')).status, 401, 'unknown device refused')
  const sealed = await seal(key, PHONE, LAN_PATHS.sync, 'req', fresh({ snapshot: {}, files: [] }))
  const flipped = fromBase64(sealed.data)
  flipped[0] ^= 1
  assert.equal((await post(LAN_PATHS.sync, { ...sealed, data: toBase64(flipped) })).status, 401, 'tampered body refused')
  const asOther = await seal(key, PHONE, LAN_PATHS.fileGet, 'req', fresh({ snapshot: {}, files: [] }))
  assert.equal((await post(LAN_PATHS.sync, asOther)).status, 401, 'a body sealed for another endpoint is refused')

  // Replays and stale clocks are refused.
  const once = await seal(key, PHONE, LAN_PATHS.fileGet, 'req', fresh({ name: 'nothing.txt' }))
  assert.equal((await post(LAN_PATHS.fileGet, once)).status, 404, 'first delivery handled')
  assert.equal((await post(LAN_PATHS.fileGet, once)).status, 401, 'the same request again is a replay')
  const old = await seal(key, PHONE, LAN_PATHS.fileGet, 'req', { ...fresh({ name: 'x' }), ts: Date.now() - 10 * 60_000 })
  assert.equal((await post(LAN_PATHS.fileGet, old)).status, 409, 'a request from far outside the clock window is refused')
  const huge = await fetch(`http://127.0.0.1:${lanPort()}${LAN_PATHS.pair}`, { method: 'POST', body: 'x'.repeat(64 * 1024) })
  assert.equal(huge.status, 413, 'oversized body refused by endpoint limit')

  // Sync: the phone's new memo lands here; our rows come back.
  const ws = workspaceRepo.create({ name: 'LAN 데스크' })
  const cat = categoryRepo.create({ workspace_id: ws.id, name: '일반' })
  const mine = taskRepo.create({ category_id: cat.id, title: '데스크톱 메모', note: '' })
  const phoneSnap = takeSnapshot(PHONE)
  const later = '2999-01-01T00:00:00.000Z'
  const phoneTasks = [...phoneSnap.tables.tasks, { ...phoneSnap.tables.tasks[0], id: 'from-phone', title: '폰에서 쓴 메모', created_at: later, updated_at: later }]
  const synced = await call<SyncResponse>(key, LAN_PATHS.sync, { snapshot: { ...phoneSnap, tables: { ...phoneSnap.tables, tasks: phoneTasks } }, files: [] })
  assert.equal(synced.status, 200, 'sync ok')
  assert.equal(taskRepo.getById('from-phone')?.title, '폰에서 쓴 메모', "phone's memo merged on the desktop")
  assert.ok(merges > 0 && synced.result!.merged > 0, 'merge reported (renderer reloads)')
  const back = synced.result!.snapshot as Snapshot
  assert.ok(back.tables.tasks.some((t) => t.id === mine.id), "desktop's rows returned to the phone")
  assert.ok(lanStatus().devices[0].last_seen, 'last seen recorded')

  // Files: a referenced attachment can be fetched; uploads only for rows we know, never paths.
  const attach = (id: string, stored: string): void => {
    const now = new Date().toISOString()
    attachmentRepo.insert({ id, task_id: mine.id, workspace_id: null, folder_id: null, file_name: stored, ext: 'txt', mime: 'text/plain', size: 1, stored_name: stored, created_at: now, updated_at: now, deleted_at: null })
  }
  const stored = 'desktop-file.txt'
  attach('att-desktop', stored)
  writeFileSync(join(attachmentsDir(), stored), 'desktop file')
  const got = await call<FileBody>(key, LAN_PATHS.fileGet, { name: stored })
  assert.equal(new TextDecoder().decode(fromBase64(got.result!.data)), 'desktop file', 'file fetched')
  assert.equal((await call(key, LAN_PATHS.fileGet, { name: '../settings.json' })).status, 400, 'path traversal refused')
  assert.equal((await call(key, LAN_PATHS.filePut, { name: 'stray.bin', data: toBase64(new Uint8Array([1])) })).status, 404, 'unreferenced upload refused')
  const missing = 'phone-only.txt'
  attach('att-phone', missing)
  assert.equal((await call(key, LAN_PATHS.filePut, { name: missing, data: toBase64(new TextEncoder().encode('from phone')) })).status, 200, 'upload')
  assert.equal(readFileSync(join(attachmentsDir(), missing), 'utf8'), 'from phone', 'uploaded file stored')

  // Forgetting the phone revokes its key.
  forgetDevice(PHONE)
  assert.equal((await call(key, LAN_PATHS.sync, { snapshot: phoneSnap, files: [] })).status, 401, 'forgotten phone refused')
  stopLanServer()
  assert.ok(!lanStatus().enabled, 'server stopped')
  console.log('lan sync: all assertions passed')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
