import { getDb } from '../db'
import { newId, nowIso } from './util'
import { MAX_NOTE_DOC_CHARS, parseNoteDoc, serializeNoteDoc } from '@shared/noteDoc'
import type { SyncedBlock, SyncedBlockSummary } from '@shared/types'

export const syncedRepo = {
  create(): SyncedBlock {
    const now = nowIso()
    const row: SyncedBlock = { id: newId(), doc: serializeNoteDoc('', []), updated_at: now }
    getDb().prepare('INSERT INTO synced_blocks (id, doc, created_at, updated_at) VALUES (?, ?, ?, ?)').run(row.id, row.doc, now, now)
    return row
  },

  get(id: string): SyncedBlock | undefined {
    return getDb().prepare('SELECT id, doc, updated_at FROM synced_blocks WHERE id = ?').get(id) as SyncedBlock | undefined
  },

  save(id: string, md: string, blocks: unknown[]): SyncedBlock {
    const doc = serializeNoteDoc(String(md), Array.isArray(blocks) ? blocks : [])
    if (doc.length > MAX_NOTE_DOC_CHARS) throw new Error('동기화 블록이 너무 큽니다.')
    const now = nowIso()
    const res = getDb().prepare('UPDATE synced_blocks SET doc = ?, updated_at = ? WHERE id = ?').run(doc, now, id)
    if (res.changes === 0) throw new Error('동기화 블록을 찾을 수 없습니다.')
    return { id, doc, updated_at: now }
  },

  /** Every synced block with a preview and how many live memos embed it. */
  list(): SyncedBlockSummary[] {
    const db = getDb()
    const count = db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE deleted_at IS NULL AND note_doc LIKE '%' || ? || '%'")
    return (db.prepare('SELECT id, doc, updated_at FROM synced_blocks ORDER BY updated_at DESC, rowid DESC').all() as SyncedBlock[]).map((s) => ({
      id: s.id,
      preview: (parseNoteDoc(s.doc)?.md ?? '').split('\n').find((l) => l.trim())?.trim().slice(0, 80) ?? '',
      used_in: (count.get(s.id) as { n: number }).n,
      updated_at: s.updated_at
    }))
  }
}
