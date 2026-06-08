import { join, extname, basename } from 'path'
import { existsSync, mkdirSync, copyFileSync, statSync, readFileSync, rmSync } from 'fs'
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

/** Copy a picked/dropped file into the attachments dir and record it. */
export function addAttachment(taskId: string, sourcePath: string, fileName: string): Attachment {
  const ext = extOf(fileName) || extOf(sourcePath)
  const size = statSync(sourcePath).size
  const storedName = ext ? `${randomUUID()}.${ext}` : randomUUID()
  copyFileSync(sourcePath, pathForStored(storedName))

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

const fileUrl = (storedName: string): string => `aop-file:///${encodeURIComponent(storedName)}`

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
