import { getDb } from '../db'
import { newId, nowIso } from './util'
import type {
  Workspace,
  CreateWorkspaceInput,
  UpdateWorkspaceInput
} from '@shared/types'

const DEFAULT_COLOR = '#6366f1'

export const workspaceRepo = {
  list(): Workspace[] {
    return getDb()
      .prepare(
        `SELECT * FROM workspaces
         WHERE deleted_at IS NULL
         ORDER BY sort_order ASC, created_at ASC`
      )
      .all() as Workspace[]
  },

  getById(id: string): Workspace | undefined {
    return getDb()
      .prepare('SELECT * FROM workspaces WHERE id = ? AND deleted_at IS NULL')
      .get(id) as Workspace | undefined
  },

  create(input: CreateWorkspaceInput): Workspace {
    const db = getDb()
    const now = nowIso()
    const nextOrder =
      (
        db
          .prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM workspaces WHERE deleted_at IS NULL')
          .get() as { m: number }
      ).m + 1

    const row: Workspace = {
      id: newId(),
      name: input.name,
      color: input.color ?? DEFAULT_COLOR,
      sort_order: nextOrder,
      created_at: now,
      updated_at: now,
      deleted_at: null
    }

    db.prepare(
      `INSERT INTO workspaces (id, name, color, sort_order, created_at, updated_at)
       VALUES (@id, @name, @color, @sort_order, @created_at, @updated_at)`
    ).run(row)

    return row
  },

  update(input: UpdateWorkspaceInput): Workspace {
    const db = getDb()
    const existing = this.getById(input.id)
    if (!existing) throw new Error(`Workspace not found: ${input.id}`)

    const updated: Workspace = {
      ...existing,
      name: input.name ?? existing.name,
      color: input.color ?? existing.color,
      sort_order: input.sort_order ?? existing.sort_order,
      updated_at: nowIso()
    }

    db.prepare(
      `UPDATE workspaces
       SET name = @name, color = @color, sort_order = @sort_order, updated_at = @updated_at
       WHERE id = @id`
    ).run(updated)

    return updated
  },

  /** Soft-delete the workspace and cascade soft-delete to its categories & tasks. */
  remove(id: string): void {
    const db = getDb()
    const now = nowIso()
    const tx = db.transaction(() => {
      db.prepare('UPDATE workspaces SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now, now, id)
      db.prepare('UPDATE categories SET deleted_at = ?, updated_at = ? WHERE workspace_id = ? AND deleted_at IS NULL').run(
        now,
        now,
        id
      )
      db.prepare(
        `UPDATE tasks SET deleted_at = ?, updated_at = ?
         WHERE deleted_at IS NULL AND category_id IN (
           SELECT id FROM categories WHERE workspace_id = ?
         )`
      ).run(now, now, id)
    })
    tx()
  }
}
