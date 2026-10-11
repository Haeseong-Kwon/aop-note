import { getDb } from '../db'
import type { DocumentSearchHit, NoteSearchHit, SearchHit } from '@shared/types'

// Search across memos (FTS5 trigram, bm25-ranked), documents, folders and desks.
// Trigram needs 3+ characters per term; shorter queries (common in Korean) use LIKE.

const MIN_TRIGRAM = 3

/** FTS5 MATCH expression (every term, AND), or null when a term is too short for trigram. */
export function ftsQuery(text: string): string | null {
  const terms = text.trim().split(/\s+/).filter(Boolean)
  if (!terms.length || terms.some((t) => [...t].length < MIN_TRIGRAM)) return null
  return terms.map((t) => `"${t.replace(/"/g, '""')}"`).join(' AND ')
}

const LIVE_TASK = `t.deleted_at IS NULL AND c.deleted_at IS NULL AND w.deleted_at IS NULL`

/** Matching memo ids, best first. */
function matchTaskIds(text: string, limit: number): string[] {
  const match = ftsQuery(text)
  const db = getDb()
  if (match) {
    return db
      .prepare(
        `SELECT f.task_id FROM notes_fts f
         JOIN tasks t ON t.id = f.task_id JOIN categories c ON c.id = t.category_id JOIN workspaces w ON w.id = c.workspace_id
         WHERE notes_fts MATCH ? AND ${LIVE_TASK}
         ORDER BY bm25(notes_fts, 0, 5, 1) LIMIT ${limit}`
      )
      .pluck()
      .all(match) as string[]
  }
  return db
    .prepare(
      `SELECT t.id FROM tasks t JOIN categories c ON c.id = t.category_id JOIN workspaces w ON w.id = c.workspace_id
       WHERE ${LIVE_TASK} AND (t.title LIKE @like ESCAPE '\\' OR t.note LIKE @like ESCAPE '\\')
       ORDER BY (t.title LIKE @like ESCAPE '\\') DESC, t.updated_at DESC LIMIT ${limit}`
    )
    .pluck()
    .all({ like: `%${escapeLike(text.trim())}%` }) as string[]
}

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
    const ids = matchTaskIds(trimmed, NOTE_HIT_LIMIT)
    const get = getDb().prepare('SELECT id, title, note FROM tasks WHERE id = ?')
    return ids.map((id) => {
      const r = get.get(id) as { id: string; title: string; note: string }
      return { id: r.id, title: r.title, snippet: snippetAround(r.note, trimmed.split(/\s+/)[0]) }
    })
  },

  /** A document's extracted text ('' when not indexed). */
  documentText(id: string): string {
    return (getDb().prepare('SELECT body FROM docs_fts WHERE attachment_id = ?').pluck().get(id) as string | undefined) ?? ''
  },

  /** Documents whose name or extracted text matches, best first. */
  documents(text: string, limit = 10): DocumentSearchHit[] {
    const trimmed = text.trim()
    if (!trimmed) return []
    const match = ftsQuery(trimmed)
    const select = `SELECT a.id, a.file_name, d.body, COALESCE(a.workspace_id, c.workspace_id) AS workspace_id, w.name AS workspace_name, w.color
       FROM docs_fts d JOIN attachments a ON a.id = d.attachment_id
       LEFT JOIN tasks t ON t.id = a.task_id LEFT JOIN categories c ON c.id = t.category_id
       JOIN workspaces w ON w.id = COALESCE(a.workspace_id, c.workspace_id)
       WHERE a.deleted_at IS NULL AND w.deleted_at IS NULL
         AND (a.task_id IS NULL OR (t.deleted_at IS NULL AND c.deleted_at IS NULL))`
    const rows = (
      match
        ? getDb().prepare(`${select} AND docs_fts MATCH ? ORDER BY bm25(docs_fts, 0, 5, 1) LIMIT ${limit}`).all(match)
        : getDb()
            .prepare(`${select} AND (d.name LIKE @like ESCAPE '\\' OR d.body LIKE @like ESCAPE '\\') LIMIT ${limit}`)
            .all({ like: `%${escapeLike(trimmed)}%` })
    ) as { id: string; file_name: string; body: string; workspace_id: string; workspace_name: string; color: string }[]
    return rows.map((r) => ({
      id: r.id,
      file_name: r.file_name,
      snippet: snippetAround(r.body, trimmed.split(/\s+/)[0]),
      workspace_id: r.workspace_id,
      workspace_name: r.workspace_name,
      color: r.color
    }))
  },

  query(text: string): SearchHit[] {
    const trimmed = text.trim()
    if (!trimmed) return []
    const db = getDb()
    const like = `%${escapeLike(trimmed)}%`

    // Tasks: ranked memo matches, with workspace/category context.
    const ctx = db.prepare(
      `SELECT t.id, t.title, t.category_id,
              c.name AS category_name, w.id AS workspace_id, w.name AS workspace_name, w.color AS color
       FROM tasks t JOIN categories c ON c.id = t.category_id JOIN workspaces w ON w.id = c.workspace_id
       WHERE t.id = ?`
    )
    const taskRows = matchTaskIds(trimmed, 20).map((id) => ctx.get(id)) as {
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

    const documents: SearchHit[] = this.documents(trimmed).map((d) => ({
      type: 'document',
      id: d.id,
      title: d.file_name,
      subtitle: d.snippet ? `${d.workspace_name} · ${d.snippet}` : `${d.workspace_name} · 문서`,
      color: d.color,
      workspace_id: d.workspace_id,
      category_id: null
    }))

    return [...tasks, ...documents, ...categories, ...workspaces]
  }
}
