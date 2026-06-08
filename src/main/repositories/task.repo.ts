import { getDb } from '../db'
import { newId, nowIso } from './util'
import type {
  Task,
  TaskWithContext,
  CreateTaskInput,
  UpdateTaskInput,
  TaskStatus
} from '@shared/types'

// List/kanban ordering: done last, then the user's manual order (sort_order).
// Manual order is primary so drag-and-drop reordering is meaningful (priority
// and due date are still surfaced as badges, not used for sorting here).
const LIST_ORDER = `
  ORDER BY
    CASE status WHEN 'done' THEN 1 ELSE 0 END ASC,
    sort_order ASC,
    created_at ASC
`

// Cross-workspace select enriched with category + workspace context.
const CONTEXT_SELECT = `
  SELECT t.*,
    c.name  AS category_name,  c.color AS category_color,
    w.id    AS workspace_id,    w.name  AS workspace_name, w.color AS workspace_color
  FROM tasks t
  JOIN categories c ON c.id = t.category_id
  JOIN workspaces w ON w.id = c.workspace_id
  WHERE t.deleted_at IS NULL AND c.deleted_at IS NULL AND w.deleted_at IS NULL
`

// Smart-view ordering: due date ascending (overdue first), then priority desc.
const CONTEXT_ORDER = `
  ORDER BY
    CASE t.status WHEN 'done' THEN 1 ELSE 0 END ASC,
    t.due_date ASC,
    t.priority DESC,
    t.created_at ASC
`

export const taskRepo = {
  listByCategory(categoryId: string): Task[] {
    return getDb()
      .prepare(`SELECT * FROM tasks WHERE category_id = ? AND deleted_at IS NULL ${LIST_ORDER}`)
      .all(categoryId) as Task[]
  },

  listByWorkspace(workspaceId: string): Task[] {
    return getDb()
      .prepare(
        `SELECT t.* FROM tasks t
         JOIN categories c ON c.id = t.category_id
         WHERE c.workspace_id = ? AND t.deleted_at IS NULL AND c.deleted_at IS NULL
         ${LIST_ORDER.replace(/\b(status|priority|due_date|sort_order|created_at)\b/g, 't.$1')}`
      )
      .all(workspaceId) as Task[]
  },

  /** Cross-workspace: tasks due on or before endIso (overdue included), for smart views. */
  listUpcoming(endIso: string): TaskWithContext[] {
    return getDb()
      .prepare(
        `${CONTEXT_SELECT} AND t.due_date IS NOT NULL AND t.due_date <= ? ${CONTEXT_ORDER}`
      )
      .all(endIso) as TaskWithContext[]
  },

  /** Cross-workspace: incomplete tasks with due_date in [startIso, endIso]. Used by the notifier. */
  listDueBetween(startIso: string, endIso: string): TaskWithContext[] {
    return getDb()
      .prepare(
        `${CONTEXT_SELECT} AND t.status != 'done'
           AND t.due_date IS NOT NULL AND t.due_date >= ? AND t.due_date <= ? ${CONTEXT_ORDER}`
      )
      .all(startIso, endIso) as TaskWithContext[]
  },

  getById(id: string): Task | undefined {
    return getDb()
      .prepare('SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL')
      .get(id) as Task | undefined
  },

  create(input: CreateTaskInput): Task {
    const db = getDb()
    const now = nowIso()
    const status: TaskStatus = input.status ?? 'todo'
    const nextOrder =
      (
        db
          .prepare(
            `SELECT COALESCE(MAX(sort_order), -1) AS m FROM tasks
             WHERE category_id = ? AND status = ? AND deleted_at IS NULL`
          )
          .get(input.category_id, status) as { m: number }
      ).m + 1

    const row: Task = {
      id: newId(),
      category_id: input.category_id,
      goal_id: input.goal_id ?? null,
      title: input.title,
      note: input.note ?? '',
      status,
      priority: input.priority ?? 0,
      due_date: input.due_date ?? null,
      sort_order: nextOrder,
      created_at: now,
      updated_at: now,
      completed_at: status === 'done' ? now : null,
      deleted_at: null
    }

    db.prepare(
      `INSERT INTO tasks
         (id, category_id, goal_id, title, note, status, priority, due_date, sort_order, created_at, updated_at, completed_at)
       VALUES
         (@id, @category_id, @goal_id, @title, @note, @status, @priority, @due_date, @sort_order, @created_at, @updated_at, @completed_at)`
    ).run(row)

    return row
  },

  update(input: UpdateTaskInput): Task {
    const db = getDb()
    const existing = this.getById(input.id)
    if (!existing) throw new Error(`Task not found: ${input.id}`)

    const nextStatus = input.status ?? existing.status
    // completed_at follows status transitions into / out of 'done'.
    const completedAt =
      nextStatus === 'done'
        ? existing.completed_at ?? nowIso()
        : nextStatus !== existing.status
          ? null
          : existing.completed_at

    const updated: Task = {
      ...existing,
      title: input.title ?? existing.title,
      note: input.note ?? existing.note,
      status: nextStatus,
      priority: input.priority ?? existing.priority,
      due_date: input.due_date === undefined ? existing.due_date : input.due_date,
      sort_order: input.sort_order ?? existing.sort_order,
      category_id: input.category_id ?? existing.category_id,
      goal_id: input.goal_id === undefined ? existing.goal_id : input.goal_id,
      completed_at: completedAt,
      updated_at: nowIso()
    }

    db.prepare(
      `UPDATE tasks SET
         title = @title, note = @note, status = @status, priority = @priority,
         due_date = @due_date, sort_order = @sort_order, category_id = @category_id,
         goal_id = @goal_id, completed_at = @completed_at, updated_at = @updated_at
       WHERE id = @id`
    ).run(updated)

    return updated
  },

  /** Kanban drag: move to a status column and set its position there. */
  setStatus(id: string, status: TaskStatus, sortOrder?: number): Task {
    return this.update({ id, status, sort_order: sortOrder })
  },

  /**
   * Bulk reorder after a drag. Each update carries the new sort_order (and
   * optionally a new status for cross-column kanban moves). We re-index with
   * plain integers in one transaction rather than fractional indexing: the
   * dataset per category/column is small, so a full reindex is cheap and keeps
   * sort_order values clean. Reuses update() so updated_at/completed_at rules hold.
   */
  reorder(updates: UpdateTaskInput[]): void {
    const db = getDb()
    const tx = db.transaction((items: UpdateTaskInput[]) => {
      items.forEach((item) => this.update(item))
    })
    tx(updates)
  },

  remove(id: string): void {
    const now = nowIso()
    getDb().prepare('UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now, now, id)
  }
}
