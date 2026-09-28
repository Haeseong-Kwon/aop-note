import { basename, join } from 'path'
import { app, clipboard, dialog, ipcMain, nativeTheme, shell, BrowserWindow } from 'electron'
import { copyFileSync } from 'fs'
import { buildGraphExport, scopeLabelFor, toExportOptions } from '../graphExport'
import { graphArchive } from '../graphArchive'
import { IPC } from '@shared/ipc'
import { workspaceRepo } from '../repositories/workspace.repo'
import { categoryRepo } from '../repositories/category.repo'
import { taskRepo } from '../repositories/task.repo'
import { goalRepo } from '../repositories/goal.repo'
import { searchRepo } from '../repositories/search.repo'
import { attachmentRepo } from '../repositories/attachment.repo'
import { docFolderRepo } from '../repositories/docFolder.repo'
import {
  addAttachment,
  addDocument,
  addAttachmentBytes,
  findAttachmentByUrl,
  renderAttachmentAsync,
  openAttachmentExternal,
  removeAttachment
} from '../attachments'
import { exportMemo } from '../memo'
import { trashRepo } from '../repositories/trash.repo'
import { linkRepo } from '../repositories/link.repo'
import { fetchLinkPreview } from '../linkPreview'
import { propertyRepo } from '../repositories/property.repo'
import { syncedRepo } from '../repositories/synced.repo'
import { aiStatus, cancelAi, runAi, setApiKey } from '../ai'
import { backupInfo, exportBackup, restoreBackup, openDataFolder } from '../backup'
import { loadSettings, saveSettings } from '../settings'
import { setShortcutEnabled } from '../quickCapture'
import { isHookInstalled, setHookInstalled } from '../claudeHook'
import { codexAddCommand, hookSpec, mcpAddCommand, type LaunchSpec } from '../claudeCommands'
import { applyBackdrop } from '../backdrop'
import {
  addCalendar,
  eventsBetween,
  listCalendars,
  removeCalendar,
  syncAllCalendars,
  syncCalendar
} from '../calendars'
import { writeVault, scheduleVaultSync, vaultBase } from '../vault'
import {
  chooseFolder,
  listProjects,
  unlinkFolder,
  projectOverview,
  readProjectFile,
  renderProjectFile,
  openProjectFileExternal,
  revealInFinder,
  openInClaudeCode
} from '../projects'
import type {
  CreateWorkspaceInput,
  CreateDocFolderInput,
  GraphExportRequest,
  DocumentUploadInput,
  UpdateWorkspaceInput,
  CreateCategoryInput,
  UpdateCategoryInput,
  CreateTaskInput,
  UpdateTaskInput,
  CreateGoalInput,
  UpdateGoalInput,
  AttachmentAddInput,
  ExportFormat,
  TaskStatus,
  TrashKind,
  AppSettings,
  PropertyType,
  SelectOption,
  AiRequest
} from '@shared/types'

// Channels that change notes; each one nudges the (debounced) vault mirror.
const WRITES = /:(create|update|reorder|remove|setStatus|add|addBytes|restore)$/

// Wraps a handler so any thrown error is logged in main and surfaced to the
// renderer as a rejected promise (instead of a silent failure).
function handle<T>(channel: string, fn: (...args: never[]) => T): void {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      const result = await fn(...(args as never[]))
      if (WRITES.test(channel)) scheduleVaultSync(() => loadSettings().vaultPath)
      return result
    } catch (error) {
      console.error(`[ipc] ${channel} failed:`, error)
      throw error
    }
  })
}

export function registerIpcHandlers(): void {
  // ---- Workspace ----
  handle(IPC.workspace.list, () => workspaceRepo.list())
  handle(IPC.workspace.create, (input: CreateWorkspaceInput) => workspaceRepo.create(input))
  handle(IPC.workspace.update, (input: UpdateWorkspaceInput) => workspaceRepo.update(input))
  handle(IPC.workspace.reorder, (updates: UpdateWorkspaceInput[]) => workspaceRepo.reorder(updates))
  handle(IPC.workspace.remove, (id: string) => workspaceRepo.remove(id))

  // ---- Category ----
  handle(IPC.category.listByWorkspace, (workspaceId: string) =>
    categoryRepo.listByWorkspace(workspaceId)
  )
  handle(IPC.category.create, (input: CreateCategoryInput) => categoryRepo.create(input))
  handle(IPC.category.update, (input: UpdateCategoryInput) => categoryRepo.update(input))
  handle(IPC.category.reorder, (updates: UpdateCategoryInput[]) => categoryRepo.reorder(updates))
  handle(IPC.category.remove, (id: string) => categoryRepo.remove(id))

  // ---- Task ----
  handle(IPC.task.listByCategory, (categoryId: string) => taskRepo.listByCategory(categoryId))
  handle(IPC.task.listByWorkspace, (workspaceId: string) => taskRepo.listByWorkspace(workspaceId))
  handle(IPC.task.listUpcoming, (endIso: string) => taskRepo.listUpcoming(endIso))
  handle(IPC.task.create, (input: CreateTaskInput) => taskRepo.create(input))
  handle(IPC.task.update, (input: UpdateTaskInput) => taskRepo.update(input))
  handle(IPC.task.setStatus, (id: string, status: TaskStatus, sortOrder?: number) =>
    taskRepo.setStatus(id, status, sortOrder)
  )
  handle(IPC.task.reorder, (updates: UpdateTaskInput[]) => taskRepo.reorder(updates))
  handle(IPC.task.remove, (id: string) => taskRepo.remove(id))
  handle(IPC.task.duplicate, (id: string) => taskRepo.duplicate(id))

  // ---- Goal ----
  handle(IPC.goal.listByWorkspace, (workspaceId: string) => goalRepo.listByWorkspace(workspaceId))
  handle(IPC.goal.create, (input: CreateGoalInput) => goalRepo.create(input))
  handle(IPC.goal.update, (input: UpdateGoalInput) => goalRepo.update(input))
  handle(IPC.goal.remove, (id: string) => goalRepo.remove(id))

  // ---- Search ----
  handle(IPC.search.query, (text: string) => searchRepo.query(text))
  handle(IPC.search.notes, (text: string) => searchRepo.notes(String(text ?? '')))

  // ---- Memo export ----
  handle(IPC.memo.export, (taskId: string, format: ExportFormat) => exportMemo(taskId, format))

  // ---- Attachments ----
  handle(IPC.attachment.listByTask, (taskId: string) => attachmentRepo.listByTask(taskId))
  handle(IPC.attachment.listByWorkspace, (workspaceId: string) =>
    attachmentRepo.listByWorkspace(workspaceId)
  )
  handle(IPC.attachment.add, (input: AttachmentAddInput) =>
    addAttachment(input.task_id, input.source_path, input.file_name)
  )
  handle(IPC.attachment.addBytes, (taskId: string, fileName: string, bytes: ArrayBuffer) =>
    addAttachmentBytes(taskId, fileName, bytes)
  )
  handle(IPC.attachment.findByUrl, (url: string) => findAttachmentByUrl(url) ?? null)
  handle(IPC.attachment.render, (id: string) => renderAttachmentAsync(id))
  handle(IPC.attachment.openExternal, (id: string) => openAttachmentExternal(id))
  handle(IPC.attachment.remove, (id: string) => removeAttachment(id))
  handle(IPC.attachment.upload, (input: DocumentUploadInput) =>
    addDocument(input.workspace_id, input.folder_id ?? null, input.source_path, input.file_name)
  )
  handle(IPC.attachment.move, (id: string, folderId: string | null) => attachmentRepo.move(id, folderId ?? null))

  // ---- 문서함 folders ----
  handle(IPC.docFolder.list, (workspaceId: string) => docFolderRepo.list(workspaceId))
  handle(IPC.docFolder.create, (input: CreateDocFolderInput) => docFolderRepo.create(input))
  handle(IPC.docFolder.rename, (id: string, name: string) => docFolderRepo.rename(id, name))
  handle(IPC.docFolder.move, (id: string, parentId: string | null) => docFolderRepo.move(id, parentId ?? null))
  handle(IPC.docFolder.remove, (id: string) => docFolderRepo.remove(id))

  // ---- Graph export (LLM context packs) + 그래프 보관함 ----
  handle(IPC.graph.stats, (req: GraphExportRequest) => buildGraphExport(toExportOptions(req)).stats)
  handle(IPC.graph.copy, (req: GraphExportRequest) => {
    const result = buildGraphExport(toExportOptions(req))
    clipboard.writeText(result.content)
    return result.stats
  })
  handle(IPC.graph.save, (req: GraphExportRequest) => {
    const opts = toExportOptions(req)
    const result = buildGraphExport(opts)
    return graphArchive.save({ title: opts.title, format: opts.format, content: result.content, stats: result.stats, scopeLabel: scopeLabelFor(opts.filter) })
  })
  handle(IPC.graph.list, () => graphArchive.list())
  handle(IPC.graph.copyArchived, (id: string) => clipboard.writeText(graphArchive.read(id)))
  handle(IPC.graph.open, async (id: string) => {
    const error = await shell.openPath(graphArchive.pathOf(id))
    if (error) throw new Error(`파일을 열지 못했습니다: ${error}`)
  })
  handle(IPC.graph.reveal, (id: string) => shell.showItemInFolder(graphArchive.pathOf(id)))
  handle(IPC.graph.saveAs, async (id: string) => {
    const from = graphArchive.pathOf(id)
    const res = await dialog.showSaveDialog({ title: '그래프 파일 저장', defaultPath: basename(from) })
    if (res.canceled || !res.filePath) return false
    copyFileSync(from, res.filePath)
    return true
  })
  handle(IPC.graph.remove, (id: string) => graphArchive.remove(id))

  // ---- Links ----
  handle(IPC.link.backlinks, (taskId: string) => linkRepo.backlinks(taskId))
  handle(IPC.link.graph, () => linkRepo.graph())
  handle(IPC.link.resolve, (title: string, fromTaskId: string | null) => linkRepo.resolve(title, fromTaskId))
  handle(IPC.link.fileBacklinks, (deskId: string, path: string) => linkRepo.fileBacklinks(deskId, path))
  handle(IPC.link.preview, (url: string) => fetchLinkPreview(String(url ?? '')))

  // ---- Project folders (read-only) ----
  handle(IPC.project.list, () => listProjects())
  handle(IPC.project.choose, (deskId: string) => chooseFolder(BrowserWindow.getFocusedWindow(), deskId))
  const optionalFolder = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined)
  handle(IPC.project.unlink, (deskId: string, folder?: string) => unlinkFolder(deskId, optionalFolder(folder)))
  handle(IPC.project.overview, (deskId: string) => projectOverview(deskId))
  handle(IPC.project.readFile, (deskId: string, path: string) => readProjectFile(deskId, path))
  handle(IPC.project.renderFile, (deskId: string, path: string) => renderProjectFile(deskId, path))
  handle(IPC.project.openFile, async (deskId: string, path: string) => {
    const error = await openProjectFileExternal(deskId, path)
    if (error) throw new Error(`파일을 열지 못했습니다: ${error}`)
  })
  handle(IPC.project.reveal, (deskId: string, path?: string) => revealInFinder(deskId, path))
  handle(IPC.project.openInClaude, (deskId: string, folder?: string) => openInClaudeCode(deskId, optionalFolder(folder)))

  // ---- Trash ----
  handle(IPC.trash.list, () => trashRepo.list())
  handle(IPC.trash.restore, (kind: TrashKind, id: string) => trashRepo.restore(kind, id))
  handle(IPC.trash.empty, () => trashRepo.empty())

  // ---- Settings ----
  handle(IPC.settings.get, () => ({
    ...loadSettings(),
    // The OS owns the login item (the user can change it in System Settings), so ask it.
    launchAtLogin: app.getLoginItemSettings().openAtLogin
  }))
  handle(IPC.settings.update, (patch: Partial<AppSettings>) => {
    const next = saveSettings(patch)
    if (typeof patch.launchAtLogin === 'boolean') app.setLoginItemSettings({ openAtLogin: next.launchAtLogin })
    if (typeof patch.globalShortcut === 'boolean' && !setShortcutEnabled(next.globalShortcut)) {
      saveSettings({ globalShortcut: false }) // don't claim a shortcut we couldn't register
      throw new Error(`${process.platform === 'darwin' ? '⌘⇧Space' : 'Ctrl+Shift+Space'}를 다른 앱이 이미 쓰고 있어 켤 수 없습니다.`)
    }
    return next
  })

  // ---- AI ----
  handle(IPC.ai.status, () => aiStatus())
  handle(IPC.ai.cancel, (id: string) => cancelAi(id))
  handle(IPC.ai.setKey, (key: string | null) => {
    setApiKey(key)
    return aiStatus()
  })
  // Not via handle(): deltas go back to the window that asked.
  ipcMain.handle(IPC.ai.run, async (event, request: AiRequest) => {
    if (!request || typeof request.id !== 'string' || typeof request.action !== 'string') throw new Error('잘못된 AI 요청입니다.')
    try {
      return await runAi(request, (text) => {
        if (!event.sender.isDestroyed()) event.sender.send(IPC.events.aiDelta, request.id, text)
      })
    } catch (error) {
      console.error('[ipc] ai:run failed:', error instanceof Error ? error.message : error)
      throw error
    }
  })

  // ---- Synced blocks ----
  handle(IPC.synced.create, () => syncedRepo.create())
  handle(IPC.synced.get, (id: string) => syncedRepo.get(id) ?? null)
  handle(IPC.synced.save, (id: string, md: string, blocks: unknown[], source: string) => {
    const saved = syncedRepo.save(id, md, blocks)
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send(IPC.events.syncedChanged, id, String(source ?? ''))
    return saved
  })
  handle(IPC.synced.list, () => syncedRepo.list())

  // ---- Databases (custom properties on a desk's tasks) ----
  handle(IPC.database.get, (workspaceId: string) => ({
    tasks: taskRepo.listAllWithContext().filter((t) => t.workspace_id === workspaceId),
    properties: propertyRepo.listByWorkspace(workspaceId),
    values: propertyRepo.valuesForWorkspace(workspaceId)
  }))
  handle(IPC.database.createProperty, (input: { workspace_id: string; name: string; type: PropertyType }) =>
    propertyRepo.create(input)
  )
  handle(IPC.database.updateProperty, (input: { id: string; name?: string; options?: SelectOption[] }) =>
    propertyRepo.update(input)
  )
  handle(IPC.database.removeProperty, (id: string) => propertyRepo.remove(id))
  handle(IPC.database.setValue, (taskId: string, propertyId: string, value: unknown) =>
    propertyRepo.setValue(taskId, propertyId, value)
  )

  // ---- Calendar subscriptions (read-only iCal feeds) ----
  handle(IPC.calendar.list, () => listCalendars())
  handle(IPC.calendar.subscribe, (input: { name: string; url: string; color: string }) => {
    if (!input || typeof input.url !== 'string' || typeof input.name !== 'string') throw new Error('잘못된 요청입니다.')
    return addCalendar({ name: input.name, url: input.url, color: String(input.color ?? '') })
  })
  handle(IPC.calendar.unsubscribe, (id: string) => removeCalendar(id))
  handle(IPC.calendar.sync, async (id?: string) => {
    if (id) await syncCalendar(id)
    else await syncAllCalendars()
    return listCalendars()
  })
  handle(IPC.calendar.events, (fromIso: string, toIso: string) => eventsBetween(fromIso, toIso))

  // ---- Claude Code (MCP server + SessionStart hook) ----
  const launchSpec = (): LaunchSpec => ({
    exe: process.execPath,
    script: join(app.getAppPath(), 'out', 'mcp', 'server.js'),
    dataDir: app.getPath('userData'),
    platform: process.platform
  })
  handle(IPC.mcp.info, () => ({
    command: mcpAddCommand(launchSpec()),
    codexCommand: codexAddCommand(launchSpec()),
    hookInstalled: isHookInstalled()
  }))
  handle(IPC.mcp.setHook, (enabled: boolean) => {
    const hook = hookSpec(launchSpec())
    return setHookInstalled(Boolean(enabled), hook.command, hook.shell)
  })

  // ---- Vault mirror ----
  handle(IPC.vault.choose, async () => {
    const res = await dialog.showOpenDialog({
      title: 'Obsidian 볼트로 쓸 폴더 선택',
      buttonLabel: '이 폴더에 미러',
      message: '선택한 폴더 안의 "AOP Note" 폴더에만 씁니다. 기존 Obsidian 볼트를 골라도 됩니다.',
      properties: ['openDirectory', 'createDirectory']
    })
    const root = res.filePaths[0]
    if (res.canceled || !root) return null
    writeVault(root)
    return saveSettings({ vaultPath: root })
  })
  handle(IPC.vault.sync, () => {
    const root = loadSettings().vaultPath
    if (!root) throw new Error('볼트 폴더가 설정되지 않았습니다.')
    return writeVault(root).written
  })
  handle(IPC.vault.disable, () => saveSettings({ vaultPath: '' }))
  handle(IPC.vault.open, async () => {
    const root = loadSettings().vaultPath
    if (!root) return
    const error = await shell.openPath(vaultBase(root))
    if (error) throw new Error(error)
  })

  // ---- Backup ----
  const focused = (): BrowserWindow | null => BrowserWindow.getFocusedWindow()
  handle(IPC.backup.info, () => backupInfo())
  handle(IPC.backup.export, () => exportBackup(focused()))
  handle(IPC.backup.restore, () => restoreBackup(focused()))
  handle(IPC.backup.openDataFolder, async () => {
    const error = await openDataFolder()
    if (error) throw new Error(error)
  })

  // Pin the native backdrop to the UI's appearance. On macOS this repaints the
  // under-window vibrancy; elsewhere the window has a solid backdrop to repaint.
  handle(IPC.theme.set, (theme: 'light' | 'dark') => {
    nativeTheme.themeSource = theme
    for (const win of BrowserWindow.getAllWindows()) applyBackdrop(win)
  })
}
