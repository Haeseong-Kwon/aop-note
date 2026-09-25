import { basename, join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { app } from 'electron'

// Kept apart from attachments.ts (which pulls in the docx/xlsx renderers) so the
// vault mirror, backups and the MCP server can locate files without those deps.

export function attachmentsDir(): string {
  const dir = join(app.getPath('userData'), 'attachments')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/** Resolve a stored file safely (basename only — no path traversal). */
export function pathForStored(storedName: string): string {
  return join(attachmentsDir(), basename(storedName))
}
