import { join } from 'path'
import { tmpdir } from 'os'
import { writeFile, unlink } from 'fs/promises'
import { randomUUID } from 'crypto'
import { dialog, BrowserWindow } from 'electron'
import { marked } from 'marked'
import { taskRepo } from './repositories/task.repo'
import type { ExportFormat, ExportResult } from '@shared/types'

const FILTERS: Record<ExportFormat, Electron.FileFilter> = {
  md: { name: 'Markdown', extensions: ['md'] },
  html: { name: 'HTML', extensions: ['html'] },
  pdf: { name: 'PDF', extensions: ['pdf'] }
}

const sanitize = (s: string): string =>
  s.replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 100) || 'memo'

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function htmlDocument(title: string, bodyHtml: string): string {
  // Self-contained, print-friendly document with sensible defaults.
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, "Apple SD Gothic Neo", sans-serif;
    line-height: 1.7; color: #1a1a1a; max-width: 760px; margin: 40px auto; padding: 0 24px; }
  h1,h2,h3 { line-height: 1.3; }
  h1 { border-bottom: 1px solid #eee; padding-bottom: .3em; }
  code { background: #f4f4f5; padding: .15em .35em; border-radius: 4px; font-size: .9em; }
  pre { background: #f4f4f5; padding: 12px 14px; border-radius: 8px; overflow: auto; }
  pre code { background: none; padding: 0; }
  blockquote { border-left: 3px solid #ddd; margin: 0; padding: .2em 1em; color: #555; }
  table { border-collapse: collapse; } th,td { border: 1px solid #ddd; padding: 6px 10px; }
  ul.contains-task-list { list-style: none; padding-left: 1em; }
  img { max-width: 100%; }
  a { color: #4f46e5; }
</style></head>
<body>${bodyHtml}</body></html>`
}

async function renderPdf(html: string): Promise<Buffer> {
  const tmp = join(tmpdir(), `aop-memo-${randomUUID()}.html`)
  await writeFile(tmp, html, 'utf8')
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
  try {
    await win.loadFile(tmp)
    return await win.webContents.printToPDF({ printBackground: true })
  } finally {
    win.destroy()
    unlink(tmp).catch(() => undefined)
  }
}

export async function exportMemo(taskId: string, format: ExportFormat): Promise<ExportResult> {
  const task = taskRepo.getById(taskId)
  if (!task) return { canceled: true }

  const markdown = `# ${task.title}\n\n${task.note ?? ''}`
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: `${sanitize(task.title)}.${format}`,
    filters: [FILTERS[format]]
  })
  if (canceled || !filePath) return { canceled: true }

  if (format === 'md') {
    await writeFile(filePath, markdown, 'utf8')
  } else {
    const body = await marked.parse(markdown)
    const html = htmlDocument(task.title, body)
    if (format === 'html') await writeFile(filePath, html, 'utf8')
    else await writeFile(filePath, await renderPdf(html))
  }

  return { canceled: false, path: filePath }
}
