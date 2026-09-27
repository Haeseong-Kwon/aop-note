// 그래프 보관함: exported context packs kept in userData/graph-exports, with a small
// manifest (index.json) for titles and stats. Only files listed in the manifest are
// ever read or deleted.
import { app } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { randomUUID } from 'crypto'
import { basename, join } from 'path'
import type { GraphArchiveEntry, GraphExportFormat, GraphExportStats } from '@shared/types'
import { fileNameFor } from './vault'

export const graphArchiveDir = (): string => join(app.getPath('userData'), 'graph-exports')
const dir = graphArchiveDir
const manifestPath = (): string => join(dir(), 'index.json')

function readManifest(): GraphArchiveEntry[] {
  try {
    const parsed: unknown = JSON.parse(readFileSync(manifestPath(), 'utf8'))
    return Array.isArray(parsed) ? (parsed as GraphArchiveEntry[]) : []
  } catch {
    return [] // first use or unreadable: start empty (files stay on disk)
  }
}

function writeManifest(entries: GraphArchiveEntry[]): void {
  mkdirSync(dir(), { recursive: true })
  writeFileSync(manifestPath(), JSON.stringify(entries, null, 2))
}

const stamp = (d: Date): string =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`

interface SaveInput {
  title: string
  format: GraphExportFormat
  content: string
  stats: GraphExportStats
  scopeLabel: string
}

export const graphArchive = {
  list(): GraphArchiveEntry[] {
    return readManifest().filter((e) => existsSync(join(dir(), e.file)))
  },

  save(input: SaveInput): GraphArchiveEntry {
    const now = new Date()
    const id = randomUUID()
    const file = `${stamp(now)}-${fileNameFor(input.title).slice(0, 60)}-${id.slice(0, 6)}.${input.format}`
    mkdirSync(dir(), { recursive: true })
    writeFileSync(join(dir(), file), input.content)
    const entry: GraphArchiveEntry = {
      id,
      title: input.title.trim() || '그래프',
      file,
      format: input.format,
      scope: input.scopeLabel,
      created_at: now.toISOString(),
      ...input.stats
    }
    writeManifest([entry, ...readManifest()])
    return entry
  },

  /** Absolute path of an archived file (throws for unknown ids). */
  pathOf(id: string): string {
    const entry = readManifest().find((e) => e.id === id)
    if (!entry) throw new Error('보관함에서 해당 그래프를 찾을 수 없습니다.')
    return join(dir(), entry.file)
  },

  read(id: string): string {
    return readFileSync(this.pathOf(id), 'utf8')
  },

  /** Merge another archive folder (a backup's) into this one; returns entries added. */
  importFrom(sourceDir: string): number {
    let incoming: GraphArchiveEntry[] = []
    try {
      const parsed: unknown = JSON.parse(readFileSync(join(sourceDir, 'index.json'), 'utf8'))
      if (Array.isArray(parsed)) incoming = parsed as GraphArchiveEntry[]
    } catch {
      return 0 // no archive in that backup
    }
    const current = readManifest()
    const known = new Set(current.map((e) => e.id))
    // Only plain file names from the manifest: never follow a path out of the folder.
    const added = incoming.filter(
      (e) => !known.has(e.id) && typeof e.file === 'string' && basename(e.file) === e.file && existsSync(join(sourceDir, e.file))
    )
    if (added.length === 0) return 0
    mkdirSync(dir(), { recursive: true })
    for (const e of added) copyFileSync(join(sourceDir, e.file), join(dir(), e.file))
    writeManifest([...current, ...added].sort((a, b) => b.created_at.localeCompare(a.created_at)))
    return added.length
  },

  remove(id: string): void {
    const entries = readManifest()
    const entry = entries.find((e) => e.id === id)
    if (!entry) return
    rmSync(join(dir(), entry.file), { force: true })
    writeManifest(entries.filter((e) => e.id !== id))
  }
}
