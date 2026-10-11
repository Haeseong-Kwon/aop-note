import { basename, extname, join } from 'path'
import { readdirSync, readFileSync, statSync } from 'fs'
import { getDb } from './db'
import { workspaceRepo } from './repositories/workspace.repo'
import { categoryRepo } from './repositories/category.repo'
import { taskRepo } from './repositories/task.repo'
import type { Workspace } from '@shared/types'

// Import a folder of Markdown (an Obsidian vault, an unzipped Notion "Markdown & CSV"
// export, any notes folder) as a new desk: subfolders → nested folders, .md files →
// memos. Notion's " <32-hex id>" name suffixes are dropped and relative links between
// pages become [[wiki links]]; Obsidian [[links]] already work as-is.
// ponytail: images/attachments inside the folder are not copied — links to them stay as text.

const NOTE_EXTS = new Set(['.md', '.markdown', '.txt'])
const SKIP_DIRS = new Set(['.obsidian', '.trash', '.git', 'node_modules', '.DS_Store'])
const MAX_NOTES = 5000
const MAX_NOTE_BYTES = 2 * 1024 * 1024
const ROOT_FOLDER = '가져온 메모'

export interface ImportResult {
  desk: Workspace
  notes: number
  folders: number
  skipped: number
}

/** "회의록 0f3b…(32 hex)" → "회의록" (Notion export names); trims whitespace. */
export function cleanName(name: string): string {
  return name.replace(/\s+[0-9a-f]{32}$/i, '').trim() || name.trim()
}

/** Split YAML frontmatter; returns its `title:` (if any) and the body without it. */
export function parseNote(text: string, fileTitle: string): { title: string; body: string } {
  let body = text.replace(/^﻿/, '').replace(/\r\n/g, '\n')
  let title = ''
  const fm = /^---\n([\s\S]*?)\n---\n?/.exec(body)
  if (fm) {
    title = /^title:\s*["']?(.+?)["']?\s*$/m.exec(fm[1])?.[1]?.trim() ?? ''
    body = body.slice(fm[0].length)
  }
  // A leading "# Heading" equal to (or standing in for) the title becomes the title.
  const h1 = /^\s*#\s+(.+)\n?/.exec(body)
  if (h1 && (!title || h1[1].trim() === title)) {
    title = title || h1[1].trim()
    body = body.slice(h1[0].length)
  }
  return { title: title || fileTitle, body: convertLinks(body).replace(/^\n+/, '') }
}

/** [Text](Some%20Page%20abc….md) → [[Some Page]]; external and non-.md links untouched. */
export function convertLinks(body: string): string {
  return body.replace(/(?<!!)\[([^\]]*)\]\(([^)\s]+\.md)\)/gi, (whole, text: string, href: string) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return whole
    let target: string
    try {
      target = cleanName(basename(decodeURIComponent(href), extname(href)))
    } catch {
      return whole
    }
    return text && cleanName(text) !== target ? `[[${target}|${text}]]` : `[[${target}]]`
  })
}

export function importMarkdownFolder(root: string): ImportResult {
  const db = getDb()
  let notes = 0
  let folders = 0
  let skipped = 0
  const run = db.transaction((): Workspace => {
    const desk = workspaceRepo.create({ name: cleanName(basename(root)) || '가져온 데스크' })
    let rootFolder: string | null = null
    const walk = (dir: string, parentId: string | null): void => {
      const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'ko'))
      for (const e of entries) {
        if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue
        const abs = join(dir, e.name)
        if (e.isDirectory()) {
          const cat = categoryRepo.create({ workspace_id: desk.id, name: cleanName(e.name), parent_id: parentId })
          folders++
          walk(abs, cat.id)
          continue
        }
        if (!e.isFile() || !NOTE_EXTS.has(extname(e.name).toLowerCase())) continue
        if (notes >= MAX_NOTES || statSync(abs).size > MAX_NOTE_BYTES) {
          skipped++
          continue
        }
        let categoryId = parentId
        if (!categoryId) {
          rootFolder ??= categoryRepo.create({ workspace_id: desk.id, name: ROOT_FOLDER }).id
          categoryId = rootFolder
        }
        const { title, body } = parseNote(readFileSync(abs, 'utf8'), cleanName(basename(e.name, extname(e.name))))
        taskRepo.create({ category_id: categoryId, title, note: body })
        notes++
      }
    }
    walk(root, null)
    if (notes === 0) throw new Error(`이 폴더에서 Markdown(.md) 파일을 찾지 못했습니다: ${root}`)
    return desk
  })
  const desk = run()
  return { desk, notes, folders, skipped }
}
