import { getDb } from '../db'
import { nowIso } from './util'
import { docFolderRepo } from './docFolder.repo'
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

  /** Every document in a desk — desk-level uploads plus memo attachments (with memo context), newest first. */
  listByWorkspace(workspaceId: string): AttachmentWithContext[] {
    return getDb()
      .prepare(
        `SELECT a.*,
            t.title AS task_title,
            c.id AS category_id, c.name AS category_name, c.color AS category_color
         FROM attachments a
         LEFT JOIN tasks t ON t.id = a.task_id
         LEFT JOIN categories c ON c.id = t.category_id
         WHERE a.deleted_at IS NULL
           AND ((a.task_id IS NULL AND a.workspace_id = ?)
             OR (c.workspace_id = ? AND t.deleted_at IS NULL AND c.deleted_at IS NULL))
         ORDER BY a.created_at DESC`
      )
      .all(workspaceId, workspaceId) as AttachmentWithContext[]
  },

  /** File a document into a 문서함 folder of its own desk (null = top level). */
  move(id: string, folderId: string | null): void {
    const row = getDb()
      .prepare(
        `SELECT COALESCE(a.workspace_id, c.workspace_id) AS workspace_id FROM attachments a
         LEFT JOIN tasks t ON t.id = a.task_id
         LEFT JOIN categories c ON c.id = t.category_id
         WHERE a.id = ? AND a.deleted_at IS NULL`
      )
      .get(id) as { workspace_id: string | null } | undefined
    if (!row?.workspace_id) throw new Error('문서를 찾을 수 없습니다.')
    docFolderRepo.requireIn(row.workspace_id, folderId)
    getDb().prepare('UPDATE attachments SET folder_id = ?, updated_at = ? WHERE id = ?').run(folderId, nowIso(), id)
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
           (id, task_id, workspace_id, folder_id, file_name, ext, mime, size, stored_name, created_at, updated_at)
         VALUES
           (@id, @task_id, @workspace_id, @folder_id, @file_name, @ext, @mime, @size, @stored_name, @created_at, @updated_at)`
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
