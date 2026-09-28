import { join, posix } from 'path'
import { workspaceRepo } from './repositories/workspace.repo'
import { getProjectIndex, type DocFile, type ProjectIndex } from './projectIndex'

// No Electron here: shared by the app (aop-project:// URLs, previews, graph) and the MCP
// server (graph export, session brief), which runs as plain Node.

export interface DeskFolder {
  path: string
  /** Its name in the merged index (folder name, "name (2)" on a clash). */
  label: string
  /** The index for this folder alone, or null if it no longer exists. */
  index: ProjectIndex | null
}

/** A desk's folders as one index. With several folders every path starts with the
 *  folder's label ("web/docs/api.md"); with one, paths are exactly as in the folder. */
export interface DeskIndex extends ProjectIndex {
  folders: DeskFolder[]
}

export function deskFolders(deskId: string): DeskFolder[] {
  const seen = new Map<string, number>()
  return workspaceRepo.folders(deskId).map((path) => {
    const base = posix.basename(path.replace(/\\/g, '/')) || path
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return { path, label: n === 1 ? base : `${base} (${n})`, index: getProjectIndex(path) }
  })
}

export function getDeskIndex(deskId: string): DeskIndex | null {
  const folders = deskFolders(deskId)
  const live = folders.filter((f) => f.index)
  if (live.length === 0) return null
  const multi = folders.length > 1
  const prefix = (label: string, p: string): string => (multi ? `${label}/${p}` : p)
  const files: DocFile[] = live.flatMap(({ label, index, path: root }) =>
    (index as ProjectIndex).files.map((f) => ({
      ...f,
      path: prefix(label, f.path),
      rel: f.path,
      abs: join(root, f.path),
      fileLinks: f.fileLinks.map((l) => prefix(label, l))
    }))
  )
  const first = live[0].index as ProjectIndex
  return {
    root: first.root,
    git: first.git,
    files,
    totalFiles: live.reduce((n, f) => n + (f.index?.totalFiles ?? 0), 0),
    truncated: live.some((f) => f.index?.truncated),
    scannedAt: Math.min(...live.map((f) => f.index?.scannedAt ?? Date.now())),
    folders
  }
}

/** Absolute path of an indexed project document, or null — the guard behind aop-project:// URLs. */
export function projectFilePath(deskId: string, path: string): string | null {
  return getDeskIndex(deskId)?.files.find((f) => f.path === path)?.abs ?? null
}
