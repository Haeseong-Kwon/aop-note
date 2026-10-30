import { pathForStored } from '../main/attachmentPaths'
import { renderAttachmentAsync } from '../main/attachments'
import { existsSync, readFileSync } from './shims/fs'
import { ipcMain } from './shims/electron'
import { IPC } from '@shared/ipc'

// Memos embed attachments as aop-file://<stored name>, a scheme the desktop app serves itself.
// A WebView can't register schemes, so on Android those URLs become blob: URLs of the file the
// fs shim holds — at display time only (the memo keeps its aop-file:// URL).

const cache = new Map<string, string>()

function blobUrlFor(url: string): string {
  if (!url.startsWith('aop-file:')) return url
  const hit = cache.get(url)
  if (hit) return hit
  try {
    const u = new URL(url)
    const path = pathForStored(decodeURIComponent(u.hostname + u.pathname))
    if (!existsSync(path)) return url
    const blob = URL.createObjectURL(new Blob([new Uint8Array(readFileSync(path) as Uint8Array)]))
    cache.set(url, blob)
    return blob
  } catch {
    return url
  }
}

export function serveFileUrls(): void {
  // The memo editor (BlockNote resolveFileUrl).
  window.aopResolveFileUrl = async (url) => blobUrlFor(url)

  // The document viewer: images and PDFs come back from attachment.render with an aop-file:// url.
  ipcMain.removeHandler(IPC.attachment.render)
  ipcMain.handle(IPC.attachment.render, async (_e: unknown, id: unknown) => {
    const result = await renderAttachmentAsync(String(id))
    return 'url' in result ? { ...result, url: blobUrlFor(result.url) } : result
  })
}
