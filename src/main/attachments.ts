import { extname, basename, isAbsolute, join, relative, resolve, sep } from 'path'
import { existsSync, copyFileSync, statSync, readFileSync, writeFileSync, rmSync, realpathSync } from 'fs'
import { randomUUID } from 'crypto'
import { app, shell } from 'electron'
import mammoth from 'mammoth'
import * as XLSX from 'xlsx'
import { attachmentRepo } from './repositories/attachment.repo'
import { docFolderRepo } from './repositories/docFolder.repo'
import { readPptxSlides } from './pptx'
import { pathForStored } from './attachmentPaths'
import { nowIso } from './repositories/util'
import { indexDocument } from './docText'
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

export { attachmentsDir, pathForStored } from './attachmentPaths'

const extOf = (name: string): string => extname(name).replace(/^\./, '').toLowerCase()

type Owner = Pick<Attachment, 'task_id' | 'workspace_id' | 'folder_id'>
const ofTask = (taskId: string): Owner => ({ task_id: taskId, workspace_id: null, folder_id: null })

function record(owner: Owner, fileName: string, storedName: string, size: number): Attachment {
  const ext = extOf(storedName)
  const now = nowIso()
  const id = randomUUID()
  // Search index fills in the background; the upload never waits on text extraction.
  setImmediate(() => void indexDocument(id).catch((error) => console.error('[search] index failed:', error)))
  return attachmentRepo.insert({
    id,
    ...owner,
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
  return copyIn(ofTask(taskId), sourcePath, fileName)
}

/** Upload straight into a desk's 문서함 (optionally into a folder) — no memo needed. */
export function addDocument(workspaceId: string, folderId: string | null, sourcePath: string, fileName: string): Attachment {
  docFolderRepo.requireIn(workspaceId, folderId)
  return copyIn({ task_id: null, workspace_id: workspaceId, folder_id: folderId }, sourcePath, fileName)
}

/** Largest file accepted as an attachment / document upload. */
const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024
/** Never copied in, even if asked: the app's own data and common credential stores. */
const PROTECTED_DIRS = ['.ssh', '.aws', '.gnupg', '.kube', '.docker', 'Library/Keychains', '.config/gh', '.config/anthropic']

/**
 * The renderer names the file to copy (drag & drop / file picker), so main checks it:
 * an absolute path to an existing regular file of sane size, outside AOP Note's data
 * folder and outside credential directories. Throws a user-facing message otherwise.
 */
export function assertUploadable(sourcePath: string): string {
  if (typeof sourcePath !== 'string' || !isAbsolute(sourcePath)) throw new Error('파일 경로가 올바르지 않습니다.')
  const abs = resolve(sourcePath)
  let real: string
  try {
    real = realpathSync(abs)
  } catch {
    throw new Error('파일을 찾을 수 없습니다.')
  }
  const st = statSync(real)
  if (!st.isFile()) throw new Error('폴더는 첨부할 수 없습니다. 파일을 선택하세요.')
  if (st.size > MAX_UPLOAD_BYTES) throw new Error('1GB 이하 파일만 올릴 수 있습니다.')
  const inside = (dir: string): boolean => {
    // Compare real paths on both sides (macOS: /var → /private/var, symlinked homes).
    const base = existsSync(dir) ? realpathSync(dir) : dir
    const rel = relative(base, real)
    return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
  }
  if (inside(app.getPath('userData'))) throw new Error('AOP Note 데이터 폴더의 파일은 첨부할 수 없습니다.')
  const home = app.getPath('home')
  if (PROTECTED_DIRS.some((d) => inside(join(home, d)))) throw new Error('보안 자격 증명 폴더의 파일은 첨부할 수 없습니다.')
  return real
}

function copyIn(owner: Owner, sourcePath: string, fileName: string): Attachment {
  const real = assertUploadable(sourcePath) // copy what was checked, not a path that could be re-pointed
  const name = basename(fileName || sourcePath).trim()
  if (!name) throw new Error('파일 이름이 비어 있습니다.')
  const storedName = newStoredName(extOf(name) || extOf(sourcePath))
  copyFileSync(real, pathForStored(storedName))
  return record(owner, name, storedName, statSync(real).size)
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
  record(ofTask(taskId), name, storedName, buf.byteLength)
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

/** Viewable content for a file on disk; `url` is how the renderer loads it (PDF / images). */
export async function renderPath(abs: string, ext: string, url: string): Promise<AttachmentRender> {
  if (!existsSync(abs)) return { kind: 'unsupported', reason: '파일이 존재하지 않습니다.' }
  try {
    if (ext === 'pdf') return { kind: 'pdf', url }
    if (IMAGE_EXTS.has(ext)) return { kind: 'image', url }
    if (SHEET_EXTS.has(ext)) {
      const wb = XLSX.readFile(abs)
      const sheets = wb.SheetNames.map((name) => ({ name, html: XLSX.utils.sheet_to_html(wb.Sheets[name]) }))
      return { kind: 'sheets', sheets }
    }
    if (TEXT_EXTS.has(ext)) return { kind: 'text', text: readFileSync(abs, 'utf8') }
    if (ext === 'docx') return { kind: 'html', html: (await mammoth.convertToHtml({ path: abs })).value }
    if (ext === 'pptx') return { kind: 'slides', slides: await readPptxSlides(readFileSync(abs)) }
    return { kind: 'unsupported', reason: `미리보기를 지원하지 않는 형식입니다 (.${ext || '?'})` }
  } catch {
    return { kind: 'unsupported', reason: '문서를 여는 중 오류가 발생했습니다.' }
  }
}

/** Produce viewable content for the in-app document viewer. */
export async function renderAttachmentAsync(id: string): Promise<AttachmentRender> {
  const row = attachmentRepo.getById(id)
  if (!row) return { kind: 'unsupported', reason: '첨부를 찾을 수 없습니다.' }
  return renderPath(pathForStored(row.stored_name), row.ext, fileUrl(row.stored_name))
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
