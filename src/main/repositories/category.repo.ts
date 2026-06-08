import { getDb } from '../db'
import { newId, nowIso } from './util'
import type {
  Category,
  CreateCategoryInput,
  UpdateCategoryInput
} from '@shared/types'

const DEFAULT_COLOR = '#94a3b8'

export const categoryRepo = {
  listByWorkspace(workspaceId: string): Category[] {
    return getDb()
      .prepare(
        `SELECT * FROM categories
         WHERE workspace_id = ? AND deleted_at IS NULL
         ORDER BY sort_order ASC, created_at ASC`
      )
      .all(workspaceId) as Category[]
  },

  getById(id: string): Category | undefined {
    return getDb()
      .prepare('SELECT * FROM categories WHERE id = ? AND deleted_at IS NULL')
      .get(id) as Category | undefined
  },

  create(input: CreateCategoryInput): Category {
    const db = getDb()
    const now = nowIso()
    const nextOrder =
      (
        db
          .prepare(
            `SELECT COALESCE(MAX(sort_order), -1) AS m FROM categories
             WHERE workspace_id = ? AND deleted_at IS NULL`
          )
          .get(input.workspace_id) as { m: number }
      ).m + 1

    const row: Category = {
      id: newId(),
      workspace_id: input.workspace_id,
      name: input.name,
      color: input.color ?? DEFAULT_COLOR,
      parent_id: input.parent_id ?? null,
      sort_order: nextOrder,
      created_at: now,
      updated_at: now,
      deleted_at: null
    }

    db.prepare(
      `INSERT INTO categories (id, workspace_id, name, color, parent_id, sort_order, created_at, updated_at)
       VALUES (@id, @workspace_id, @name, @color, @parent_id, @sort_order, @created_at, @updated_at)`
    ).run(row)

    return row
  },

  update(input: UpdateCategoryInput): Category {
    const db = getDb()
    const existing = this.getById(input.id)
    if (!existing) throw new Error(`Category not found: ${input.id}`)

    const updated: Category = {
      ...existing,
      name: input.name ?? existing.name,
      color: input.color ?? existing.color,
      parent_id: input.parent_id === undefined ? existing.parent_id : input.parent_id,
      sort_order: input.sort_order ?? existing.sort_order,
      updated_at: nowIso()
    }

    db.prepare(
      `UPDATE categories
       SET name = @name, color = @color, parent_id = @parent_id,
           sort_order = @sort_order, updated_at = @updated_at
       WHERE id = @id`
    ).run(updated)

    return updated
  },

  /** Bulk reorder after a drag — integer reindex in one transaction (see task.repo.reorder). */
  reorder(updates: UpdateCategoryInput[]): void {
    const db = getDb()
    const tx = db.transaction((items: UpdateCategoryInput[]) => {
      items.forEach((item) => this.update(item))
    })
    tx(updates)
  },

  /** Soft-delete a category, its child categories, and all their tasks. */
  remove(id: string): void {
    const db = getDb()
    const now = nowIso()
    const tx = db.transaction(() => {
      // Collect this category + direct children (1-level nesting only).
      const childIds = (
        db.prepare('SELECT id FROM categories WHERE parent_id = ? AND deleted_at IS NULL').all(id) as {
          id: string
        }[]
      ).map((r) => r.id)
      const allIds = [id, ...childIds]
      const placeholders = allIds.map(() => '?').join(',')

      db.prepare(
        `UPDATE categories SET deleted_at = ?, updated_at = ? WHERE id IN (${placeholders})`
      ).run(now, now, ...allIds)
      db.prepare(
        `UPDATE tasks SET deleted_at = ?, updated_at = ?
         WHERE deleted_at IS NULL AND category_id IN (${placeholders})`
      ).run(now, now, ...allIds)
    })
    tx()
  }
}
