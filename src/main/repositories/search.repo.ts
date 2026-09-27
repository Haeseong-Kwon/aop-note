import { getDb } from '../db'
import type { NoteSearchHit, SearchHit } from '@shared/types'

// Lightweight LIKE-based search across tasks, categories, and workspaces.
// Kept in one place so it can later be swapped for an FTS5 virtual table
// without touching callers. Dataset is small, so LIKE is plenty for now.

const escapeLike = (s: string): string => s.replace(/[\\%_]/g, (m) => `\\${m}`)

const NOTE_HIT_LIMIT = 500
const SNIPPET_CONTEXT = 30

/** The text around the first case-insensitive match, on one line; '' if the note doesn't contain it. */
function snippetAround(note: string, needle: string): string {
  const at = note.toLowerCase().indexOf(needle.toLowerCase())
  if (at < 0) return ''
  const start = Math.max(0, at - SNIPPET_CONTEXT)
  const end = Math.min(note.length, at + needle.length + SNIPPET_CONTEXT)
  const text = note.slice(start, end).replace(/\s+/g, ' ').trim()
  return `${start > 0 ? '…' : ''}${text}${end < note.length ? '…' : ''}`
}

export const searchRepo = {
  /** Every live memo whose title or body contains `text` (graph search), with a body snippet. */
  notes(text: string): NoteSearchHit[] {
    const trimmed = text.trim()
    if (!trimmed) return []
    const rows = getDb()
      .prepare(
        `SELECT t.id, t.title, t.note FROM tasks t
         JOIN categories c ON c.id = t.category_id
         JOIN workspaces w ON w.id = c.workspace_id
         WHERE t.deleted_at IS NULL AND c.deleted_at IS NULL AND w.deleted_at IS NULL
           AND (t.title LIKE @like ESCAPE '\\' OR t.note LIKE @like ESCAPE '\\')
         ORDER BY t.updated_at DESC
         LIMIT ${NOTE_HIT_LIMIT}`
      )
      .all({ like: `%${escapeLike(trimmed)}%` }) as { id: string; title: string; note: string }[]
    return rows.map((r) => ({ id: r.id, title: r.title, snippet: snippetAround(r.note, trimmed) }))
  },

  query(text: string): SearchHit[] {
    const trimmed = text.trim()
    if (!trimmed) return []
    const db = getDb()
    const like = `%${escapeLike(trimmed)}%`

    // Tasks: match title or note, carry workspace/category context.
    const taskRows = db
      .prepare(
        `SELECT t.id, t.title, t.category_id,
                c.name AS category_name, w.id AS workspace_id, w.name AS workspace_name, w.color AS color
         FROM tasks t
         JOIN categories c ON c.id = t.category_id
         JOIN workspaces w ON w.id = c.workspace_id
         WHERE t.deleted_at IS NULL AND c.deleted_at IS NULL AND w.deleted_at IS NULL
           AND (t.title LIKE @like ESCAPE '\\' OR t.note LIKE @like ESCAPE '\\')
         ORDER BY t.updated_at DESC
         LIMIT 20`
      )
      .all({ like }) as {
      id: string
      title: string
      category_id: string
      category_name: string
      workspace_id: string
      workspace_name: string
      color: string
    }[]

    const categoryRows = db
      .prepare(
        `SELECT c.id, c.name, c.color, w.id AS workspace_id, w.name AS workspace_name
         FROM categories c
         JOIN workspaces w ON w.id = c.workspace_id
         WHERE c.deleted_at IS NULL AND w.deleted_at IS NULL AND c.name LIKE @like ESCAPE '\\'
         ORDER BY c.name LIMIT 10`
      )
      .all({ like }) as {
      id: string
      name: string
      color: string
      workspace_id: string
      workspace_name: string
    }[]

    const workspaceRows = db
      .prepare(
        `SELECT id, name, color FROM workspaces
         WHERE deleted_at IS NULL AND name LIKE @like ESCAPE '\\'
         ORDER BY name LIMIT 10`
      )
      .all({ like }) as { id: string; name: string; color: string }[]

    const tasks: SearchHit[] = taskRows.map((r) => ({
      type: 'task',
      id: r.id,
      title: r.title,
      subtitle: `${r.workspace_name} · ${r.category_name}`,
      color: r.color,
      workspace_id: r.workspace_id,
      category_id: r.category_id
    }))
    const categories: SearchHit[] = categoryRows.map((r) => ({
      type: 'category',
      id: r.id,
      title: r.name,
      subtitle: `${r.workspace_name} · 카테고리`,
      color: r.color,
      workspace_id: r.workspace_id,
      category_id: r.id
    }))
    const workspaces: SearchHit[] = workspaceRows.map((r) => ({
      type: 'workspace',
      id: r.id,
      title: r.name,
      subtitle: '데스크',
      color: r.color,
      workspace_id: r.id,
      category_id: null
    }))

    return [...tasks, ...categories, ...workspaces]
  }
}
