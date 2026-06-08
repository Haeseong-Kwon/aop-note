import { getDb } from '../db'
import { nowIso } from './util'
import type { Attachment } from '@shared/types'

export const attachmentRepo = {
  listByTask(taskId: string): Attachment[] {
    return getDb()
      .prepare(
        `SELECT * FROM attachments
         WHERE task_id = ? AND deleted_at IS NULL
         ORDER BY created_at ASC`
      )
      .all(taskId) as Attachment[]
  },

  getById(id: string): Attachment | undefined {
    return getDb()
      .prepare('SELECT * FROM attachments WHERE id = ? AND deleted_at IS NULL')
      .get(id) as Attachment | undefined
  },

  insert(row: Attachment): Attachment {
    getDb()
      .prepare(
        `INSERT INTO attachments
           (id, task_id, file_name, ext, mime, size, stored_name, created_at, updated_at)
         VALUES
           (@id, @task_id, @file_name, @ext, @mime, @size, @stored_name, @created_at, @updated_at)`
      )
      .run(row)
    return row
  },

  softDelete(id: string): void {
    const now = nowIso()
    getDb()
      .prepare('UPDATE attachments SET deleted_at = ?, updated_at = ? WHERE id = ?')
      .run(now, now, id)
  }
}
