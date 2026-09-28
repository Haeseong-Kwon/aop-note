import { execFile, spawn } from 'child_process'
import { watch, readFileSync, type FSWatcher } from 'fs'
import { extname } from 'path'
import { dialog, shell, type BrowserWindow } from 'electron'
import { workspaceRepo } from './repositories/workspace.repo'
import { DOC_EXT, TEXT_DOC_EXT, invalidateProject, validateFolder } from './projectIndex'
import { getGitInfo, invalidateGit } from './git'
import { renderPath } from './attachments'
import { deskFolders, getDeskIndex, projectFilePath } from './projectFiles'

export { projectFilePath }
import type { AttachmentRender, ProjectFile, ProjectOverview, ProjectSummary, Workspace } from '@shared/types'

const MAX_READ_BYTES = 2 * 1024 * 1024
const WATCH_DEBOUNCE_MS = 800

/** One of the desk's linked folders: `folder` if it is linked, else the primary one. */
function deskFolder(deskId: string, folder?: string): string {
  const folders = workspaceRepo.folders(deskId)
  if (folders.length === 0) throw new Error('이 데스크에는 연결된 폴더가 없습니다.')
  if (folder === undefined) return folders[0]
  if (!folders.includes(folder)) throw new Error('이 데스크에 연결된 폴더가 아닙니다.')
  return folder
}

/** Link one more folder to the desk (a project can span several). */
export function linkFolder(deskId: string, folder: string): Workspace {
  const desk = workspaceRepo.addFolder(deskId, validateFolder(folder))
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

/** Unlink one folder, or every folder when none is given. */
export function unlinkFolder(deskId: string, folder?: string): Workspace {
  const desk = folder === undefined ? workspaceRepo.setFolder(deskId, null) : workspaceRepo.removeFolder(deskId, folder)
  refreshWatchers()
  return desk
}

export function projectOverview(deskId: string): ProjectOverview | null {
  const folders = deskFolders(deskId)
  if (folders.length === 0) return null
  const index = getDeskIndex(deskId)
  const primary = folders[0]
  return {
    folder: primary.path,
    exists: folders.every((f) => f.index !== null),
    git: primary.index ? getGitInfo(primary.path) : null,
    files: (index?.files ?? []).map(({ path, title, size, mtime }) => ({ path, title, size, mtime })),
    totalFiles: index?.totalFiles ?? 0,
    truncated: index?.truncated ?? false,
    folders: folders.map((f) => ({
      path: f.path,
      label: f.label,
      exists: f.index !== null,
      git: f.index ? getGitInfo(f.path) : null,
      docs: f.index?.files.length ?? 0,
      totalFiles: f.index?.totalFiles ?? 0
    }))
  }
}

/** Every desk with a linked folder, for the 프로젝트 list. */
export function listProjects(): ProjectSummary[] {
  return workspaceRepo.list().flatMap((desk) => {
    const folders = deskFolders(desk.id)
    if (folders.length === 0) return []
    const index = getDeskIndex(desk.id)
    // The desk's git state: the first linked folder that is a repo.
    const repo = folders.find((f) => f.index?.git)
    const git = repo ? getGitInfo(repo.path) : null
    const last = git?.commits[0]
    return [
      {
        desk_id: desk.id,
        name: desk.name,
        color: desk.color,
        icon: desk.icon,
        folder: folders[0].path,
        folders: folders.map((f) => f.path),
        exists: folders.every((f) => f.index !== null),
        docs: index?.files.length ?? 0,
        git: git
          ? {
              branch: git.branch,
              changed: git.changed,
              ahead: git.ahead,
              last_commit: last?.subject ?? null,
              last_commit_date: last?.date ?? null
            }
          : null
      }
    ]
  })
}

/** Only documents in the index can be read — the renderer can't ask for arbitrary paths. */
export function readProjectFile(deskId: string, path: string): ProjectFile {
  const file = getDeskIndex(deskId)?.files.find((f) => f.path === path)
  if (!file?.abs) throw new Error(`프로젝트 문서가 아닙니다: ${path}`)
  const binary = !TEXT_DOC_EXT.test(file.path)
  const content =
    binary ? '' : file.size > MAX_READ_BYTES ? '_파일이 너무 커서 미리보기를 생략했습니다._' : readFileSync(file.abs, 'utf8')
  return { path: file.path, title: file.title, content, binary }
}

/** PDF / Word / Excel … preview of a project document, same viewer as 문서함. */
export function renderProjectFile(deskId: string, path: string): Promise<AttachmentRender> {
  const abs = projectFilePath(deskId, path)
  if (!abs) throw new Error(`프로젝트 문서가 아닙니다: ${path}`)
  const url = `aop-project:///${encodeURIComponent(deskId)}/${encodeURIComponent(path)}`
  return renderPath(abs, extname(path).slice(1).toLowerCase(), url)
}

export function openProjectFileExternal(deskId: string, path: string): Promise<string> {
  const abs = projectFilePath(deskId, path)
  if (!abs) throw new Error(`프로젝트 문서가 아닙니다: ${path}`)
  return shell.openPath(abs)
}

/** A document (by index path) in the file manager, or one linked folder (by its absolute path), or the primary folder. */
export function revealInFinder(deskId: string, path?: string): void {
  const abs = path ? projectFilePath(deskId, path) : null
  if (abs) return shell.showItemInFolder(abs)
  void shell.openPath(deskFolder(deskId, path && workspaceRepo.folders(deskId).includes(path) ? path : undefined))
}

/** Open a terminal in the project running `claude` (macOS Terminal, Windows console; elsewhere just the folder). */
export function openInClaudeCode(deskId: string, which?: string): Promise<void> {
  const folder = deskFolder(deskId, which)
  if (process.platform === 'win32') {
    // `start` opens a new console window in the folder. Windows paths can't contain
    // double quotes, so quoting the folder is enough; nothing else here is user input.
    const child = spawn('cmd.exe', ['/c', `start "Claude Code" /D "${folder}" cmd.exe /k claude`], {
      detached: true,
      stdio: 'ignore',
      windowsVerbatimArguments: true,
      windowsHide: true
    })
    return new Promise((done, fail) => {
      child.once('error', (error) => fail(new Error(`터미널을 열지 못했습니다: ${error.message}`)))
      child.once('spawn', () => {
        child.unref()
        done()
      })
    })
  }
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

// Branch switches and commits move HEAD / refs; index and object writes are noise.
const GIT_STATE_CHANGE = /^\.git[\\/](HEAD|packed-refs|refs[\\/])/

/** One watcher per linked folder; a change anywhere refreshes that folder's desk. */
export function refreshWatchers(): void {
  const wanted = new Map<string, { deskId: string; folder: string }>()
  for (const desk of workspaceRepo.list()) {
    for (const folder of workspaceRepo.folders(desk.id)) wanted.set(`${desk.id}\u0000${folder}`, { deskId: desk.id, folder })
  }
  for (const [key, w] of watchers) {
    if (wanted.has(key)) continue
    w.close()
    watchers.delete(key)
  }
  for (const [key, { deskId, folder }] of wanted) {
    if (watchers.has(key)) continue
    let timer: ReturnType<typeof setTimeout> | null = null
    try {
      // persistent: false — a watcher never keeps the process alive on its own (quit, checks).
      const w = watch(folder, { recursive: true, persistent: false }, (_event, name) => {
        const file = String(name ?? '')
        // Docs changed, or git HEAD / refs moved.
        if (!DOC_EXT.test(file) && !GIT_STATE_CHANGE.test(file)) return
        if (file.includes('node_modules')) return
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => {
          invalidateProject(folder)
          invalidateGit(folder)
          notify(deskId)
        }, WATCH_DEBOUNCE_MS)
      })
      w.on('error', () => w.close()) // folder removed: stop quietly; overview reports it missing
      watchers.set(key, w)
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
