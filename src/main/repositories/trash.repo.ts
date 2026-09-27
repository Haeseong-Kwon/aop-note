import type Database from 'better-sqlite3'
import { rmSync } from 'fs'
import { pathForStored } from '../attachmentPaths'
import { getDb } from '../db'
import { nowIso } from './util'
import type { TrashItem, TrashKind } from '@shared/types'

// Every row a single delete touched shares one deleted_at stamp (see the repos'
// remove()), so "the batch" = rows under the item carrying the item's stamp.
// `IS NOT` rather than `!=` so NULL (= alive) compares as "different".

const LIST_SQL = `
  SELECT 'workspace' AS kind, w.id, w.name AS title, '' AS context, w.color, w.deleted_at,
    (SELECT COUNT(*) FROM tasks t JOIN categories c ON c.id = t.category_id
      WHERE c.workspace_id = w.id AND t.deleted_at = w.deleted_at) AS task_count
  FROM workspaces w
  WHERE w.deleted_at IS NOT NULL

  UNION ALL
  SELECT 'category', c.id, c.name, w.name || COALESCE(' / ' || p.name, ''), c.color, c.deleted_at,
    (SELECT COUNT(*) FROM tasks t JOIN categories cc ON cc.id = t.category_id
      WHERE (cc.id = c.id OR cc.parent_id = c.id) AND t.deleted_at = c.deleted_at)
  FROM categories c
  JOIN workspaces w ON w.id = c.workspace_id
  LEFT JOIN categories p ON p.id = c.parent_id
  WHERE c.deleted_at IS NOT NULL
    AND w.deleted_at IS NOT c.deleted_at
    AND (p.id IS NULL OR p.deleted_at IS NOT c.deleted_at)

  UNION ALL
  SELECT 'task', t.id, t.title, w.name || ' / ' || c.name, c.color, t.deleted_at, 1
  FROM tasks t
  JOIN categories c ON c.id = t.category_id
  JOIN workspaces w ON w.id = c.workspace_id
  WHERE t.deleted_at IS NOT NULL AND c.deleted_at IS NOT t.deleted_at

  ORDER BY deleted_at DESC
`

const TABLE: Record<TrashKind, string> = {
  workspace: 'workspaces',
  category: 'categories',
  task: 'tasks'
}

interface Parents {
  deleted_at: string | null
  category_id?: string
  parent_id?: string | null
  workspace_id?: string
}

/** Un-delete one item's batch, then any deleted ancestor's batch so the item is reachable. */
function restoreEntity(db: Database.Database, kind: TrashKind, id: string, now: string): void {
  const row = db.prepare(`SELECT * FROM ${TABLE[kind]} WHERE id = ?`).get(id) as Parents | undefined
  if (!row?.deleted_at) return
  const stamp = row.deleted_at

  if (kind === 'workspace') {
    db.prepare('UPDATE workspaces SET deleted_at = NULL, updated_at = ? WHERE id = ?').run(now, id)
    db.prepare(
      'UPDATE categories SET deleted_at = NULL, updated_at = ? WHERE workspace_id = ? AND deleted_at = ?'
    ).run(now, id, stamp)
    db.prepare(
      `UPDATE tasks SET deleted_at = NULL, updated_at = ?
       WHERE deleted_at = ? AND category_id IN (SELECT id FROM categories WHERE workspace_id = ?)`
    ).run(now, stamp, id)
    return
  }

  if (kind === 'category') {
    db.prepare(
      `UPDATE tasks SET deleted_at = NULL, updated_at = ?
       WHERE deleted_at = ? AND category_id IN (SELECT id FROM categories WHERE id = ? OR parent_id = ?)`
    ).run(now, stamp, id, id)
    db.prepare(
      'UPDATE categories SET deleted_at = NULL, updated_at = ? WHERE (id = ? OR parent_id = ?) AND deleted_at = ?'
    ).run(now, id, id, stamp)
    if (row.parent_id) restoreEntity(db, 'category', row.parent_id, now)
    restoreEntity(db, 'workspace', row.workspace_id as string, now)
    return
  }

  db.prepare('UPDATE tasks SET deleted_at = NULL, updated_at = ? WHERE id = ?').run(now, id)
  restoreEntity(db, 'category', row.category_id as string, now)
}

// Everything in the trash plus whatever only lives under it. Recursive so a
// category under a trashed parent / desk goes too, whatever its own stamp.
const DOOMED = `
  WITH RECURSIVE
    dw(id) AS (SELECT id FROM workspaces WHERE deleted_at IS NOT NULL),
    dc(id) AS (
      SELECT id FROM categories WHERE deleted_at IS NOT NULL OR workspace_id IN dw
      UNION SELECT c.id FROM categories c JOIN dc ON c.parent_id = dc.id
    ),
    dt(id) AS (SELECT id FROM tasks WHERE deleted_at IS NOT NULL OR category_id IN dc),
    dg(id) AS (SELECT id FROM goals WHERE deleted_at IS NOT NULL OR workspace_id IN dw),
    dp(id) AS (SELECT id FROM properties WHERE deleted_at IS NOT NULL OR workspace_id IN dw)
`

/** Child tables before parents (foreign keys are on, no ON DELETE CASCADE). */
const PURGE = [
  'DELETE FROM task_values WHERE task_id IN dt OR property_id IN dp',
  'DELETE FROM attachments WHERE task_id IN dt OR deleted_at IS NOT NULL',
  'UPDATE tasks SET goal_id = NULL WHERE goal_id IN dg',
  'DELETE FROM tasks WHERE id IN dt',
  'DELETE FROM categories WHERE id IN dc',
  'DELETE FROM goals WHERE id IN dg',
  'DELETE FROM properties WHERE id IN dp',
  'DELETE FROM workspaces WHERE id IN dw'
]

export const trashRepo = {
  list(): TrashItem[] {
    return getDb().prepare(LIST_SQL).all() as TrashItem[]
  },

  restore(kind: TrashKind, id: string): void {
    const db = getDb()
    if (!Object.hasOwn(TABLE, kind)) throw new Error(`알 수 없는 항목 종류: ${kind}`)
    const row = db
      .prepare(`SELECT deleted_at FROM ${TABLE[kind]} WHERE id = ?`)
      .get(id) as { deleted_at: string | null } | undefined
    if (!row?.deleted_at) throw new Error('휴지통에서 해당 항목을 찾을 수 없습니다.')
    db.transaction(() => restoreEntity(db, kind, id, nowIso()))()
  },

  /** Permanently delete everything in the trash (and its attachment files). Returns the entries removed. */
  empty(): number {
    const db = getDb()
    const count = this.list().length
    const files = db
      .prepare(`${DOOMED} SELECT stored_name FROM attachments WHERE task_id IN dt OR deleted_at IS NOT NULL`)
      .pluck()
      .all() as string[]
    db.transaction(() => {
      for (const sql of PURGE) db.prepare(`${DOOMED} ${sql}`).run()
    })()
    // Files after the commit: a failed transaction must not lose them.
    for (const name of files) rmSync(pathForStored(name), { force: true })
    return count
  }
}
