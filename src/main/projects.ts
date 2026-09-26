import { execFile } from 'child_process'
import { watch, readFileSync, type FSWatcher } from 'fs'
import { join } from 'path'
import { dialog, shell, type BrowserWindow } from 'electron'
import { workspaceRepo } from './repositories/workspace.repo'
import { getProjectIndex, invalidateProject, validateFolder } from './projectIndex'
import { getGitInfo, invalidateGit } from './git'
import type { ProjectFile, ProjectOverview, Workspace } from '@shared/types'

const MAX_READ_BYTES = 2 * 1024 * 1024
const WATCH_DEBOUNCE_MS = 800

function deskFolder(deskId: string): { desk: Workspace; folder: string } {
  const desk = workspaceRepo.getById(deskId)
  if (!desk?.folder_path) throw new Error('이 데스크에는 연결된 폴더가 없습니다.')
  return { desk, folder: desk.folder_path }
}

export function linkFolder(deskId: string, folder: string): Workspace {
  const desk = workspaceRepo.setFolder(deskId, validateFolder(folder))
  refreshWatchers()
  return desk
}

export async function chooseFolder(win: BrowserWindow | null, deskId: string): Promise<Workspace | null> {
  const options = {
    title: '프로젝트 폴더 연결',
    buttonLabel: '연결',
    message: '개발 중인 레포나 문서 폴더를 고르세요. 파일은 읽기만 하고 수정하지 않습니다.',
    properties: ['openDirectory'] as 'openDirectory'[]
  }
  const res = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  const folder = res.filePaths[0]
  if (res.canceled || !folder) return null
  return linkFolder(deskId, folder)
}

export function unlinkFolder(deskId: string): Workspace {
  const desk = workspaceRepo.setFolder(deskId, null)
  refreshWatchers()
  return desk
}

export function projectOverview(deskId: string): ProjectOverview | null {
  const desk = workspaceRepo.getById(deskId)
  if (!desk?.folder_path) return null
  const index = getProjectIndex(desk.folder_path)
  return {
    folder: desk.folder_path,
    exists: index !== null,
    git: index ? getGitInfo(desk.folder_path) : null,
    files: (index?.files ?? []).map(({ path, title, size, mtime }) => ({ path, title, size, mtime })),
    totalFiles: index?.totalFiles ?? 0,
    truncated: index?.truncated ?? false
  }
}

/** Only documents in the index can be read — the renderer can't ask for arbitrary paths. */
export function readProjectFile(deskId: string, path: string): ProjectFile {
  const { folder } = deskFolder(deskId)
  const file = getProjectIndex(folder)?.files.find((f) => f.path === path)
  if (!file) throw new Error(`프로젝트 문서가 아닙니다: ${path}`)
  const content = file.size > MAX_READ_BYTES ? '_파일이 너무 커서 미리보기를 생략했습니다._' : readFileSync(join(folder, file.path), 'utf8')
  return { path: file.path, title: file.title, content }
}

export function revealInFinder(deskId: string, path?: string): void {
  const { folder } = deskFolder(deskId)
  const file = path ? getProjectIndex(folder)?.files.find((f) => f.path === path) : null
  if (file) shell.showItemInFolder(join(folder, file.path))
  else void shell.openPath(folder)
}

/** Open a terminal in the project running `claude` (macOS Terminal; elsewhere just the folder). */
export function openInClaudeCode(deskId: string): Promise<void> {
  const { folder } = deskFolder(deskId)
  if (process.platform !== 'darwin') {
    return shell.openPath(folder).then(() => undefined)
  }
  // Two layers of quoting: POSIX shell inside an AppleScript string literal.
  const shellQuoted = `'${folder.replace(/'/g, `'\\''`)}'`
  const command = `cd ${shellQuoted} && claude`
  const script = `tell application "Terminal"
  activate
  do script "${command.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"
end tell`
  return new Promise((done, fail) => {
    execFile('osascript', ['-e', script], (error) =>
      error ? fail(new Error(`터미널을 열지 못했습니다: ${error.message}`)) : done()
    )
  })
}

// ---- watching linked folders so docs / git state stay current ----

const watchers = new Map<string, FSWatcher>()
let notify: (deskId: string) => void = () => undefined

const DOC_CHANGE = /\.(md|mdx|markdown|txt)$/i

export function refreshWatchers(): void {
  const desks = workspaceRepo.list().filter((d) => d.folder_path)
  for (const [id, w] of watchers) {
    if (!desks.some((d) => d.id === id)) {
      w.close()
      watchers.delete(id)
    }
  }
  for (const desk of desks) {
    const folder = desk.folder_path as string
    const existing = watchers.get(desk.id) as (FSWatcher & { folder?: string }) | undefined
    if (existing?.folder === folder) continue
    existing?.close()
    let timer: ReturnType<typeof setTimeout> | null = null
    try {
      const w = watch(folder, { recursive: true }, (_event, name) => {
        const file = String(name ?? '')
        // Docs changed, or git state (HEAD, index, refs) moved.
        if (!DOC_CHANGE.test(file) && !file.startsWith('.git')) return
        if (file.includes('node_modules')) return
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => {
          invalidateProject(folder)
          invalidateGit(folder)
          notify(desk.id)
        }, WATCH_DEBOUNCE_MS)
      }) as FSWatcher & { folder?: string }
      w.folder = folder
      w.on('error', () => w.close()) // folder removed: stop quietly; overview reports it missing
      watchers.set(desk.id, w)
    } catch (error) {
      console.error('[projects] cannot watch', folder, error)
    }
  }
}

export function startProjectWatching(onChange: (deskId: string) => void): () => void {
  notify = onChange
  refreshWatchers()
  return () => {
    for (const w of watchers.values()) w.close()
    watchers.clear()
  }
}
