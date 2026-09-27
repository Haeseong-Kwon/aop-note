import { join } from 'path'
import { workspaceRepo } from './repositories/workspace.repo'
import { getProjectIndex } from './projectIndex'

// No Electron here: shared by the app (aop-project:// URLs, previews) and the MCP
// server (graph export), which runs as plain Node.

/** Absolute path of an indexed project document, or null — the guard behind aop-project:// URLs. */
export function projectFilePath(deskId: string, path: string): string | null {
  const folder = workspaceRepo.getById(deskId)?.folder_path
  const file = folder ? getProjectIndex(folder)?.files.find((f) => f.path === path) : undefined
  return folder && file ? join(folder, file.path) : null
}
