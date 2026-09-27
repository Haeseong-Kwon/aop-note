import { getDb } from '../db'
import { newId, nowIso } from './util'
import type { CreateDocFolderInput, DocFolder } from '@shared/types'

const MAX_NAME = 200

function cleanName(name: string): string {
  const trimmed = (name ?? '').trim()
  if (!trimmed) throw new Error('폴더 이름을 입력하세요.')
  return trimmed.slice(0, MAX_NAME)
}

function getFolder(id: string): DocFolder | undefined {
  return getDb().prepare('SELECT * FROM doc_folders WHERE id = ?').get(id) as DocFolder | undefined
}

export const docFolderRepo = {
  list(workspaceId: string): DocFolder[] {
    return getDb()
      .prepare('SELECT * FROM doc_folders WHERE workspace_id = ? ORDER BY name COLLATE NOCASE ASC, created_at ASC')
      .all(workspaceId) as DocFolder[]
  },

  /** Throws unless `folderId` is null (top level) or a folder of this desk. */
  requireIn(workspaceId: string, folderId: string | null): void {
    if (folderId === null) return
    if (getFolder(folderId)?.workspace_id !== workspaceId) throw new Error('해당 폴더를 찾을 수 없습니다.')
  },

  create(input: CreateDocFolderInput): DocFolder {
    const parentId = input.parent_id ?? null
    this.requireIn(input.workspace_id, parentId)
    const now = nowIso()
    const row: DocFolder = {
      id: newId(),
      workspace_id: input.workspace_id,
      name: cleanName(input.name),
      parent_id: parentId,
      created_at: now,
      updated_at: now
    }
    getDb()
      .prepare(
        `INSERT INTO doc_folders (id, workspace_id, name, parent_id, created_at, updated_at)
         VALUES (@id, @workspace_id, @name, @parent_id, @created_at, @updated_at)`
      )
      .run(row)
    return row
  },

  rename(id: string, name: string): void {
    getDb().prepare('UPDATE doc_folders SET name = ?, updated_at = ? WHERE id = ?').run(cleanName(name), nowIso(), id)
  },

  move(id: string, parentId: string | null): void {
    const folder = getFolder(id)
    if (!folder) throw new Error('해당 폴더를 찾을 수 없습니다.')
    this.requireIn(folder.workspace_id, parentId)
    const intoOwnSubtree = getDb()
      .prepare(
        `WITH RECURSIVE sub(id) AS (SELECT ? UNION SELECT f.id FROM doc_folders f JOIN sub ON f.parent_id = sub.id)
         SELECT 1 FROM sub WHERE id = ?`
      )
      .get(id, parentId)
    if (intoOwnSubtree) throw new Error('폴더를 자기 자신이나 그 하위 폴더 안으로 옮길 수 없습니다.')
    getDb().prepare('UPDATE doc_folders SET parent_id = ?, updated_at = ? WHERE id = ?').run(parentId, nowIso(), id)
  },

  /** Delete the folder only — its documents and sub-folders move up one level, nothing is lost. */
  remove(id: string): void {
    const folder = getFolder(id)
    if (!folder) return
    const db = getDb()
    const now = nowIso()
    db.transaction(() => {
      db.prepare('UPDATE doc_folders SET parent_id = ?, updated_at = ? WHERE parent_id = ?').run(folder.parent_id, now, id)
      db.prepare('UPDATE attachments SET folder_id = ?, updated_at = ? WHERE folder_id = ?').run(folder.parent_id, now, id)
      db.prepare('DELETE FROM doc_folders WHERE id = ?').run(id)
    })()
  }
}
