import { join, basename } from 'path'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'fs'
import { backfillDocumentIndex } from './docText'
import { randomUUID } from 'crypto'
import { app } from 'electron'
import { getDb } from './db'
import { SCHEMA_VERSION } from './db/migrations'
import { attachmentsDir } from './attachmentPaths'
import type { SyncResult } from '@shared/types'

export type { SyncResult }

// Device-to-device sync through a folder both machines see (iCloud Drive, Dropbox,
// OneDrive, a NAS share). Each device writes one snapshot file of its rows; every other
// device merges those rows in with last-writer-wins per row (newer updated_at wins).
// Deletes are soft (deleted_at), so they travel like edits. Attachment files are copied
// both ways by their unique stored name. SQLite itself never lives in the shared folder.
//
// ponytail: whole-row LWW — two devices editing the same memo offline keep the later
// edit; device clocks are trusted; a row purged from the trash can come back (as trashed)
// from a device that still has it. Field-level merge / tombstones if this bites.

export const SYNC_FOLDER = 'AOP Note Sync'
const SNAPSHOT_FORMAT = 1

/** Synced tables in foreign-key order. `lww` = has updated_at; others merge insert-only. */
const TABLES: readonly { name: string; key: readonly string[]; lww: boolean }[] = [
  { name: 'workspaces', key: ['id'], lww: true },
  { name: 'categories', key: ['id'], lww: true },
  { name: 'goals', key: ['id'], lww: true },
  { name: 'tasks', key: ['id'], lww: true },
  { name: 'schedules', key: ['id'], lww: true },
  { name: 'doc_folders', key: ['id'], lww: true },
  { name: 'attachments', key: ['id'], lww: true },
  { name: 'synced_blocks', key: ['id'], lww: true },
  { name: 'properties', key: ['id'], lww: true }
]
/** Tables whose parent_id may form a cycle when two devices move items into each other concurrently. */
const TREE_TABLES = ['workspaces', 'categories', 'tasks'] as const
/** Device-local columns never sent (linked folder paths differ per machine; index flags are local). */
const LOCAL_COLUMNS = new Set(['folder_path', 'text_indexed'])

type Row = Record<string, unknown>

export interface Snapshot {
  format: number
  schema: number
  device: string
  exported_at: string
  tables: Record<string, Row[]>
}


export const syncDir = (root: string): string => join(root, SYNC_FOLDER)

/** Stable id of this installation (file in userData). */
export function deviceId(): string {
  const path = join(app.getPath('userData'), 'device-id')
  if (existsSync(path)) return readFileSync(path, 'utf8').trim()
  const id = randomUUID()
  writeFileSync(path, id)
  return id
}

const columnsOf = (table: string): string[] =>
  (getDb().prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name)

export function takeSnapshot(device: string, now = new Date()): Snapshot {
  const db = getDb()
  const tables: Record<string, Row[]> = {}
  for (const t of TABLES) {
    const cols = columnsOf(t.name).filter((c) => !LOCAL_COLUMNS.has(c))
    tables[t.name] = db.prepare(`SELECT ${cols.map((c) => `"${c}"`).join(', ')} FROM ${t.name}`).all() as Row[]
  }
  // Custom-field cells travel with their memo (see mergeSnapshot).
  tables.task_values = db.prepare('SELECT task_id, property_id, value FROM task_values').all() as Row[]
  return { format: SNAPSHOT_FORMAT, schema: SCHEMA_VERSION, device, exported_at: now.toISOString(), tables }
}

/** Merge another device's rows; returns how many rows were inserted or updated. */
export function mergeSnapshot(snap: Snapshot): number {
  if (snap.format !== SNAPSHOT_FORMAT) throw new Error('알 수 없는 동기화 파일 형식입니다.')
  if (snap.schema > SCHEMA_VERSION) throw new Error('다른 기기가 더 새 버전의 AOP Note를 씁니다. 이 기기의 앱을 업데이트하세요.')
  const db = getDb()
  let changed = 0
  const wonTasks = new Set<string>()
  db.transaction(() => {
    // Parents and children arrive in any order within a table (sub-memos, sub-desks).
    db.pragma('defer_foreign_keys = ON')
    for (const t of TABLES) {
      const rows = snap.tables[t.name]
      if (!Array.isArray(rows) || rows.length === 0) continue
      const local = new Set(columnsOf(t.name))
      for (const row of rows) {
        const cols = Object.keys(row).filter((c) => local.has(c) && !LOCAL_COLUMNS.has(c))
        if (!t.key.every((k) => cols.includes(k))) continue
        if (t.lww && typeof row.updated_at !== 'string') continue // malformed row: never let it win
        const updates = cols.filter((c) => !t.key.includes(c))
        const conflict = t.lww && updates.length
          ? `DO UPDATE SET ${updates.map((c) => `"${c}" = excluded."${c}"`).join(', ')} WHERE excluded.updated_at > ${t.name}.updated_at`
          : 'DO NOTHING'
        const sql = `INSERT INTO ${t.name} (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})
                     ON CONFLICT(${t.key.join(', ')}) ${conflict}`
        const n = db.prepare(sql).run(...cols.map((c) => row[c] as never)).changes
        changed += n
        if (n > 0 && t.name === 'tasks') wonTasks.add(String(row.id))
      }
    }
    // The memos whose incoming copy won take that copy's custom-field values (so clears propagate).
    const incoming = Array.isArray(snap.tables.task_values) ? snap.tables.task_values : []
    const clear = db.prepare('DELETE FROM task_values WHERE task_id = ?')
    const put = db.prepare('INSERT OR REPLACE INTO task_values (task_id, property_id, value) VALUES (?, ?, ?)')
    for (const id of wonTasks) clear.run(id)
    for (const v of incoming) {
      if (wonTasks.has(String(v.task_id)) && typeof v.property_id === 'string' && typeof v.value === 'string') {
        put.run(String(v.task_id), v.property_id, v.value)
      }
    }
    for (const table of TREE_TABLES) changed += breakCycles(table)
  })()
  return changed
}

/**
 * Two devices that each moved an item under the other leave a parent cycle, which hides
 * both from every tree. Lift one member of each cycle to the top level; returns rows fixed.
 */
function breakCycles(table: (typeof TREE_TABLES)[number]): number {
  const db = getDb()
  const parent = new Map(
    (db.prepare(`SELECT id, parent_id FROM ${table} WHERE parent_id IS NOT NULL`).all() as { id: string; parent_id: string }[]).map((r) => [r.id, r.parent_id])
  )
  const lift = db.prepare(`UPDATE ${table} SET parent_id = NULL WHERE id = ?`)
  const settled = new Set<string>()
  let fixed = 0
  for (const start of parent.keys()) {
    const path = new Set<string>()
    for (let id: string | undefined = start; id && !settled.has(id); id = parent.get(id)) {
      if (path.has(id)) {
        lift.run(id) // id closes the loop: make it a root
        parent.delete(id)
        fixed++
        break
      }
      path.add(id)
    }
    path.forEach((id) => settled.add(id))
  }
  return fixed
}

/** Largest attachment file copied through the sync folder. */
const MAX_SYNC_FILE_BYTES = 1024 * 1024 * 1024

/** Copy the attachment files named in `wanted` that `toDir` lacks (never anything unreferenced). */
function copyMissing(fromDir: string, toDir: string, wanted: ReadonlySet<string>): number {
  if (!existsSync(fromDir)) return 0
  mkdirSync(toDir, { recursive: true })
  const have = new Set(readdirSync(toDir))
  let copied = 0
  for (const name of readdirSync(fromDir)) {
    if (have.has(name) || !wanted.has(name) || name !== basename(name)) continue
    const from = join(fromDir, name)
    const st = statSync(from)
    if (!st.isFile() || st.size > MAX_SYNC_FILE_BYTES) continue
    copyFileSync(from, join(toDir, name))
    copied++
  }
  return copied
}

/** One round: merge every other device's snapshot, then publish ours (atomic rename). */
export function syncNow(root: string, device = deviceId()): SyncResult {
  const dir = syncDir(root)
  mkdirSync(join(dir, 'devices'), { recursive: true })
  let merged = 0
  let devices = 0
  for (const file of readdirSync(join(dir, 'devices'))) {
    if (!file.endsWith('.json') || file === `${device}.json`) continue
    try {
      merged += mergeSnapshot(JSON.parse(readFileSync(join(dir, 'devices', file), 'utf8')) as Snapshot)
      devices++
    } catch (error) {
      // A half-synced file from the cloud client, or a newer app: skip it this round, keep the rest.
      console.error(`[sync] skipped ${file}:`, error instanceof Error ? error.message : error)
    }
  }
  // Only files some attachment row points at move, in either direction.
  const referenced = new Set(getDb().prepare('SELECT stored_name FROM attachments').pluck().all() as string[])
  const files =
    copyMissing(join(dir, 'attachments'), attachmentsDir(), referenced) + copyMissing(attachmentsDir(), join(dir, 'attachments'), referenced)
  // Documents that arrived from another device: extract their text for search in the background.
  if (merged > 0 || files > 0) void backfillDocumentIndex().catch((error) => console.error('[sync] index failed:', error))
  const target = join(dir, 'devices', `${device}.json`)
  const staged = `${target}.tmp`
  writeFileSync(staged, JSON.stringify(takeSnapshot(device)))
  renameSync(staged, target)
  return { exported: true, merged, devices, files }
}

// ---- keeping devices in step ----

const SYNC_DEBOUNCE_MS = 10_000
const SYNC_INTERVAL_MS = 5 * 60_000
let debounce: ReturnType<typeof setTimeout> | null = null
let running = false

function runSync(getRoot: () => string, onMerged: (r: SyncResult) => void): void {
  const root = getRoot()
  if (!root || running) return
  running = true
  try {
    const result = syncNow(root)
    if (result.merged > 0) onMerged(result)
  } catch (error) {
    console.error('[sync] failed:', error) // folder offline / unmounted: try again next round
  } finally {
    running = false
  }
}

/** After a local edit: publish soon (debounced so typing becomes one write). No-op when sync is off. */
export function scheduleSync(getRoot: () => string, onMerged: (r: SyncResult) => void): void {
  if (!getRoot()) return
  if (debounce) clearTimeout(debounce)
  debounce = setTimeout(() => {
    debounce = null
    runSync(getRoot, onMerged)
  }, SYNC_DEBOUNCE_MS)
}

/** Sync on start and every few minutes (picks up other devices' edits and MCP writes). Returns a stopper. */
export function startSyncLoop(getRoot: () => string, onMerged: (r: SyncResult) => void): () => void {
  runSync(getRoot, onMerged)
  const timer = setInterval(() => runSync(getRoot, onMerged), SYNC_INTERVAL_MS)
  return () => {
    clearInterval(timer)
    if (debounce) clearTimeout(debounce)
    runSync(getRoot, onMerged) // publish the last edits before quitting
  }
}
