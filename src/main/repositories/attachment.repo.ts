import { getDb } from '../db'
import { nowIso } from './util'
import type { Attachment, AttachmentWithContext } from '@shared/types'

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

  /** All attachments across a desk, joined with task + category context. */
  listByWorkspace(workspaceId: string): AttachmentWithContext[] {
    return getDb()
      .prepare(
        `SELECT a.*,
            t.title AS task_title,
            c.id AS category_id, c.name AS category_name, c.color AS category_color
         FROM attachments a
         JOIN tasks t ON t.id = a.task_id
         JOIN categories c ON c.id = t.category_id
         WHERE c.workspace_id = ?
           AND a.deleted_at IS NULL AND t.deleted_at IS NULL AND c.deleted_at IS NULL
         ORDER BY c.sort_order ASC, c.created_at ASC, a.created_at DESC`
      )
      .all(workspaceId) as AttachmentWithContext[]
  },

  /** Resolve the attachment an `aop-file://` URL in a memo points at. */
  getByStoredName(storedName: string): Attachment | undefined {
    return getDb()
      .prepare('SELECT * FROM attachments WHERE stored_name = ? AND deleted_at IS NULL')
      .get(storedName) as Attachment | undefined
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
