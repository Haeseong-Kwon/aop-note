// Lossless memo storage. `tasks.note` stays Markdown — search, [[links]], the MCP server,
// the vault mirror and exports all read it — but Markdown can't hold text colours,
// toggles, callouts, alignment… So the editor also saves its block tree here, tagged
// with the Markdown it produced. If `note` is later changed outside the editor, the
// tag no longer matches and Markdown wins (appends are merged, see resolveInitial).

export interface NoteDoc {
  v: 1
  /** The Markdown these blocks serialised to when saved. */
  md: string
  blocks: unknown[]
}

export const MAX_NOTE_DOC_CHARS = 5_000_000

export function serializeNoteDoc(md: string, blocks: unknown[]): string {
  return JSON.stringify({ v: 1, md, blocks } satisfies NoteDoc)
}

export function parseNoteDoc(json: string | null | undefined): NoteDoc | null {
  if (!json) return null
  try {
    const doc = JSON.parse(json) as Partial<NoteDoc>
    return doc?.v === 1 && typeof doc.md === 'string' && Array.isArray(doc.blocks) ? (doc as NoteDoc) : null
  } catch {
    return null
  }
}

/**
 * What to load into the editor. `blocks` null → parse the whole Markdown.
 * Otherwise use the saved blocks, plus `append` — Markdown added after them outside
 * the editor (e.g. Claude Code's append_to_note) — parsed and attached at the end.
 */
export function resolveInitial(note: string, docJson: string | null | undefined): { blocks: unknown[] | null; append: string } {
  const doc = parseNoteDoc(docJson)
  if (!doc) return { blocks: null, append: '' }
  if (note === doc.md) return { blocks: doc.blocks, append: '' }
  if (doc.md.trim() && note.startsWith(doc.md)) return { blocks: doc.blocks, append: note.slice(doc.md.length).trim() }
  return { blocks: null, append: '' }
}

/** Deep-copy `value`, passing every inline text run ({type:'text', text}) through fn. */
function mapText(value: unknown, fn: (text: string) => string): unknown {
  if (Array.isArray(value)) return value.map((v) => mapText(v, fn))
  if (!value || typeof value !== 'object') return value
  const obj = value as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) out[k] = mapText(v, fn)
  if (obj.type === 'text' && typeof obj.text === 'string') out.text = fn(obj.text)
  return out
}

/** New doc with every text run transformed (paragraphs, links, tables, nested children). */
export function mapDocText(doc: NoteDoc, fn: (text: string) => string): NoteDoc {
  return { ...doc, blocks: mapText(doc.blocks, fn) as unknown[] }
}

/** New doc with every checklist item unticked (a repeating task's next round). */
export function uncheckDoc(doc: NoteDoc): NoteDoc {
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk)
    if (!value || typeof value !== 'object') return value
    const obj = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) out[k] = walk(v)
    if (obj.type === 'checkListItem' && obj.props && typeof obj.props === 'object') {
      out.props = { ...(obj.props as Record<string, unknown>), checked: false }
    }
    return out
  }
  return { ...doc, blocks: walk(doc.blocks) as unknown[] }
}
