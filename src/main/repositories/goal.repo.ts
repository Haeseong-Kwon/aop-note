import { getDb } from '../db'
import { newId, nowIso } from './util'
import type {
  Goal,
  GoalWithProgress,
  CreateGoalInput,
  UpdateGoalInput
} from '@shared/types'

// Goals enriched with linked-task progress, computed in SQL via subqueries.
const SELECT_WITH_PROGRESS = `
  SELECT g.*,
    (SELECT COUNT(*) FROM tasks t WHERE t.goal_id = g.id AND t.deleted_at IS NULL) AS total_tasks,
    (SELECT COUNT(*) FROM tasks t WHERE t.goal_id = g.id AND t.deleted_at IS NULL AND t.status = 'done') AS done_tasks
  FROM goals g
`

type GoalRow = Goal & { total_tasks: number; done_tasks: number }

function withProgress(row: GoalRow): GoalWithProgress {
  const progress = row.total_tasks > 0 ? row.done_tasks / row.total_tasks : 0
  return { ...row, progress }
}

export const goalRepo = {
  listByWorkspace(workspaceId: string): GoalWithProgress[] {
    const rows = getDb()
      .prepare(
        `${SELECT_WITH_PROGRESS}
         WHERE g.workspace_id = ? AND g.deleted_at IS NULL
         ORDER BY
           CASE g.status WHEN 'done' THEN 1 ELSE 0 END ASC,
           CASE WHEN g.due_date IS NULL THEN 1 ELSE 0 END ASC,
           g.due_date ASC,
           g.sort_order ASC,
           g.created_at ASC`
      )
      .all(workspaceId) as GoalRow[]
    return rows.map(withProgress)
  },

  getById(id: string): GoalWithProgress | undefined {
    const row = getDb()
      .prepare(`${SELECT_WITH_PROGRESS} WHERE g.id = ? AND g.deleted_at IS NULL`)
      .get(id) as GoalRow | undefined
    return row ? withProgress(row) : undefined
  },

  create(input: CreateGoalInput): GoalWithProgress {
    const db = getDb()
    const now = nowIso()
    const status = input.status ?? 'todo'
    const nextOrder =
      (
        db
          .prepare(
            `SELECT COALESCE(MAX(sort_order), -1) AS m FROM goals
             WHERE workspace_id = ? AND deleted_at IS NULL`
          )
          .get(input.workspace_id) as { m: number }
      ).m + 1

    const row = {
      id: newId(),
      workspace_id: input.workspace_id,
      title: input.title,
      description: input.description ?? '',
      due_date: input.due_date ?? null,
      status,
      sort_order: nextOrder,
      created_at: now,
      updated_at: now,
      completed_at: status === 'done' ? now : null
    }

    db.prepare(
      `INSERT INTO goals
         (id, workspace_id, title, description, due_date, status, sort_order, created_at, updated_at, completed_at)
       VALUES
         (@id, @workspace_id, @title, @description, @due_date, @status, @sort_order, @created_at, @updated_at, @completed_at)`
    ).run(row)

    return this.getById(row.id)!
  },

  update(input: UpdateGoalInput): GoalWithProgress {
    const db = getDb()
    const existing = this.getById(input.id)
    if (!existing) throw new Error(`Goal not found: ${input.id}`)

    const nextStatus = input.status ?? existing.status
    const completedAt =
      nextStatus === 'done'
        ? existing.completed_at ?? nowIso()
        : nextStatus !== existing.status
          ? null
          : existing.completed_at

    const updated = {
      id: existing.id,
      title: input.title ?? existing.title,
      description: input.description ?? existing.description,
      due_date: input.due_date === undefined ? existing.due_date : input.due_date,
      status: nextStatus,
      sort_order: input.sort_order ?? existing.sort_order,
      completed_at: completedAt,
      updated_at: nowIso()
    }

    db.prepare(
      `UPDATE goals SET
         title = @title, description = @description, due_date = @due_date,
         status = @status, sort_order = @sort_order,
         completed_at = @completed_at, updated_at = @updated_at
       WHERE id = @id`
    ).run(updated)

    return this.getById(existing.id)!
  },

  /** Soft-delete the goal and unlink (not delete) its tasks. */
  remove(id: string): void {
    const db = getDb()
    const now = nowIso()
    const tx = db.transaction(() => {
      db.prepare('UPDATE tasks SET goal_id = NULL, updated_at = ? WHERE goal_id = ?').run(now, id)
      db.prepare('UPDATE goals SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now, now, id)
    })
    tx()
  }
}
