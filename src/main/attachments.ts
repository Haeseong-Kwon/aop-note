import { join, extname, basename } from 'path'
import { existsSync, mkdirSync, copyFileSync, statSync, readFileSync, writeFileSync, rmSync } from 'fs'
import { randomUUID } from 'crypto'
import { app, shell } from 'electron'
import mammoth from 'mammoth'
import * as XLSX from 'xlsx'
import { attachmentRepo } from './repositories/attachment.repo'
import { nowIso } from './repositories/util'
import type { Attachment, AttachmentRender } from '@shared/types'

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'])
const SHEET_EXTS = new Set(['xlsx', 'xls', 'xlsm', 'csv'])
const TEXT_EXTS = new Set(['txt', 'md', 'markdown', 'json', 'log', 'rtf'])

const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  csv: 'text/csv',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  txt: 'text/plain',
  md: 'text/markdown'
}

export function attachmentsDir(): string {
  const dir = join(app.getPath('userData'), 'attachments')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/** Resolve a stored file safely (basename only — no path traversal). */
export function pathForStored(storedName: string): string {
  return join(attachmentsDir(), basename(storedName))
}

const extOf = (name: string): string => extname(name).replace(/^\./, '').toLowerCase()

function record(taskId: string, fileName: string, storedName: string, size: number): Attachment {
  const ext = extOf(storedName)
  const now = nowIso()
  return attachmentRepo.insert({
    id: randomUUID(),
    task_id: taskId,
    file_name: fileName,
    ext,
    mime: MIME[ext] ?? '',
    size,
    stored_name: storedName,
    created_at: now,
    updated_at: now,
    deleted_at: null
  })
}

const newStoredName = (ext: string): string => (ext ? `${randomUUID()}.${ext}` : randomUUID())

/** Copy a picked/dropped file into the attachments dir and record it. */
export function addAttachment(taskId: string, sourcePath: string, fileName: string): Attachment {
  const storedName = newStoredName(extOf(fileName) || extOf(sourcePath))
  copyFileSync(sourcePath, pathForStored(storedName))
  return record(taskId, fileName, storedName, statSync(sourcePath).size)
}

const fileUrl = (storedName: string): string => `aop-file:///${encodeURIComponent(storedName)}`

/** Max size for a file embedded in a memo — keeps the SQLite-backed app responsive. */
const MAX_EMBED_BYTES = 50 * 1024 * 1024

/**
 * Store raw bytes sent from the renderer (memo drag & drop / paste) and return the
 * `aop-file://` URL the editor embeds. Bytes are used instead of a source path so
 * clipboard images — which have no file on disk — work too.
 */
export function addAttachmentBytes(
  taskId: string,
  fileName: string,
  bytes: ArrayBuffer | Uint8Array
): string {
  const name = basename(fileName || 'file').trim()
  if (!name) throw new Error('파일 이름이 비어 있습니다.')
  const buf = Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))
  if (buf.byteLength === 0) throw new Error('빈 파일은 첨부할 수 없습니다.')
  if (buf.byteLength > MAX_EMBED_BYTES) throw new Error('50MB 이하 파일만 첨부할 수 있습니다.')

  const storedName = newStoredName(extOf(name))
  writeFileSync(pathForStored(storedName), buf)
  record(taskId, name, storedName, buf.byteLength)
  return fileUrl(storedName)
}

/**
 * Resolve an `aop-file://` URL embedded in a memo back to its attachment, so the
 * memo can open it in the same viewer the documents tab uses. Chromium normalises
 * the URL differently depending on slash count, so read host and path together.
 */
export function findAttachmentByUrl(url: string): Attachment | undefined {
  if (!url.startsWith('aop-file:')) return undefined
  try {
    const u = new URL(url)
    const storedName = basename(decodeURIComponent(u.hostname + u.pathname))
    return storedName ? attachmentRepo.getByStoredName(storedName) : undefined
  } catch {
    return undefined
  }
}

/** Produce viewable content for the in-app document viewer. */
export function renderAttachment(id: string): AttachmentRender {
  const row = attachmentRepo.getById(id)
  if (!row) return { kind: 'unsupported', reason: '첨부를 찾을 수 없습니다.' }
  const abs = pathForStored(row.stored_name)
  if (!existsSync(abs)) return { kind: 'unsupported', reason: '파일이 존재하지 않습니다.' }

  const ext = row.ext

  try {
    if (ext === 'pdf') return { kind: 'pdf', url: fileUrl(row.stored_name) }
    if (IMAGE_EXTS.has(ext)) return { kind: 'image', url: fileUrl(row.stored_name) }
    if (SHEET_EXTS.has(ext)) {
      const wb = XLSX.readFile(abs)
      const sheets = wb.SheetNames.map((name) => ({
        name,
        html: XLSX.utils.sheet_to_html(wb.Sheets[name])
      }))
      return { kind: 'sheets', sheets }
    }
    if (TEXT_EXTS.has(ext)) {
      return { kind: 'text', text: readFileSync(abs, 'utf8') }
    }
    // .docx is handled in renderAttachmentAsync; anything else is unsupported here.
    return { kind: 'unsupported', reason: `미리보기를 지원하지 않는 형식입니다 (.${ext || '?'})` }
  } catch {
    return { kind: 'unsupported', reason: '문서를 여는 중 오류가 발생했습니다.' }
  }
}

/** Async path for docx (mammoth is promise-based). Falls back through renderAttachment otherwise. */
export async function renderAttachmentAsync(id: string): Promise<AttachmentRender> {
  const row = attachmentRepo.getById(id)
  if (!row) return { kind: 'unsupported', reason: '첨부를 찾을 수 없습니다.' }
  const abs = pathForStored(row.stored_name)
  if (!existsSync(abs)) return { kind: 'unsupported', reason: '파일이 존재하지 않습니다.' }

  if (row.ext === 'docx') {
    try {
      const result = await mammoth.convertToHtml({ path: abs })
      return { kind: 'html', html: result.value }
    } catch {
      return { kind: 'unsupported', reason: 'Word 문서를 변환하지 못했습니다.' }
    }
  }
  return renderAttachment(id)
}

/** Open the original file in the OS default application. */
export async function openAttachmentExternal(id: string): Promise<void> {
  const row = attachmentRepo.getById(id)
  if (!row) return
  await shell.openPath(pathForStored(row.stored_name))
}

/** Soft-delete the record and remove the physical file to reclaim space. */
export function removeAttachment(id: string): void {
  const row = attachmentRepo.getById(id)
  attachmentRepo.softDelete(id)
  if (row) {
    try {
      rmSync(pathForStored(row.stored_name), { force: true })
    } catch {
      /* best-effort cleanup */
    }
  }
}
