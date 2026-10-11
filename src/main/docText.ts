import { readFileSync, existsSync } from 'fs'
import mammoth from 'mammoth'
import * as XLSX from 'xlsx'
import { getDb } from './db'
import { readPptxSlides } from './pptx'
import { pathForStored } from './attachmentPaths'

// Plain text of an uploaded document for full-text search (docs_fts). Extraction runs
// off the hot path: on upload and as a background backfill, never during a query.

/** Indexed text per document is capped so one huge file can't bloat the DB. */
const MAX_TEXT_CHARS = 200_000
const TEXT_EXTS = new Set(['txt', 'md', 'markdown', 'json', 'log', 'csv'])
const SHEET_EXTS = new Set(['xlsx', 'xls', 'xlsm'])

export async function extractText(abs: string, ext: string): Promise<string> {
  if (!existsSync(abs)) return ''
  let text = ''
  if (TEXT_EXTS.has(ext)) text = readFileSync(abs, 'utf8')
  else if (ext === 'docx') text = (await mammoth.extractRawText({ path: abs })).value
  else if (SHEET_EXTS.has(ext)) {
    const wb = XLSX.readFile(abs)
    text = wb.SheetNames.map((n) => XLSX.utils.sheet_to_csv(wb.Sheets[n])).join('\n')
  } else if (ext === 'pptx') {
    const slides = await readPptxSlides(readFileSync(abs))
    text = slides.map((s) => [s.title, ...s.paragraphs, s.notes].join('\n')).join('\n')
  } else if (ext === 'pdf') {
    const { extractText: pdfText, getDocumentProxy } = await import('unpdf')
    const pdf = await getDocumentProxy(new Uint8Array(readFileSync(abs)))
    text = (await pdfText(pdf, { mergePages: true })).text
  }
  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT_CHARS)
}

/** (Re)index one document's name + body. Failures index the name only; the doc stays findable by title. */
export async function indexDocument(id: string): Promise<void> {
  const db = getDb()
  const row = db.prepare('SELECT file_name, ext, stored_name FROM attachments WHERE id = ? AND deleted_at IS NULL').get(id) as
    | { file_name: string; ext: string; stored_name: string }
    | undefined
  if (!row) return
  let body = ''
  try {
    body = await extractText(pathForStored(row.stored_name), row.ext)
  } catch (error) {
    console.error(`[search] text extraction failed for ${row.file_name}:`, error instanceof Error ? error.message : error)
  }
  db.transaction(() => {
    db.prepare('DELETE FROM docs_fts WHERE attachment_id = ?').run(id)
    db.prepare('INSERT INTO docs_fts (attachment_id, name, body) VALUES (?, ?, ?)').run(id, row.file_name, body)
    db.prepare('UPDATE attachments SET text_indexed = 1 WHERE id = ?').run(id)
  })()
}

/** Index every document not yet indexed (after the upgrade, or uploads made while extraction failed). */
export async function backfillDocumentIndex(): Promise<number> {
  const ids = getDb().prepare('SELECT id FROM attachments WHERE deleted_at IS NULL AND text_indexed = 0').pluck().all() as string[]
  for (const id of ids) await indexDocument(id)
  return ids.length
}
