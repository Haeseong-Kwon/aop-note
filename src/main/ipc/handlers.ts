import { join } from 'path'
import { app, dialog, ipcMain, nativeTheme, shell, BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc'
import { workspaceRepo } from '../repositories/workspace.repo'
import { categoryRepo } from '../repositories/category.repo'
import { taskRepo } from '../repositories/task.repo'
import { goalRepo } from '../repositories/goal.repo'
import { searchRepo } from '../repositories/search.repo'
import { attachmentRepo } from '../repositories/attachment.repo'
import {
  addAttachment,
  addAttachmentBytes,
  findAttachmentByUrl,
  renderAttachmentAsync,
  openAttachmentExternal,
  removeAttachment
} from '../attachments'
import { exportMemo } from '../memo'
import { trashRepo } from '../repositories/trash.repo'
import { linkRepo } from '../repositories/link.repo'
import { backupInfo, exportBackup, restoreBackup, openDataFolder } from '../backup'
import { loadSettings, saveSettings } from '../settings'
import { setShortcutEnabled } from '../quickCapture'
import { writeVault, scheduleVaultSync, vaultBase } from '../vault'
import type {
  CreateWorkspaceInput,
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
  AppSettings
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

  // ---- Goal ----
  handle(IPC.goal.listByWorkspace, (workspaceId: string) => goalRepo.listByWorkspace(workspaceId))
  handle(IPC.goal.create, (input: CreateGoalInput) => goalRepo.create(input))
  handle(IPC.goal.update, (input: UpdateGoalInput) => goalRepo.update(input))
  handle(IPC.goal.remove, (id: string) => goalRepo.remove(id))

  // ---- Search ----
  handle(IPC.search.query, (text: string) => searchRepo.query(text))

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

  // ---- Links ----
  handle(IPC.link.backlinks, (taskId: string) => linkRepo.backlinks(taskId))
  handle(IPC.link.graph, () => linkRepo.graph())
  handle(IPC.link.resolve, (title: string, fromTaskId: string | null) => linkRepo.resolve(title, fromTaskId))

  // ---- Trash ----
  handle(IPC.trash.list, () => trashRepo.list())
  handle(IPC.trash.restore, (kind: TrashKind, id: string) => trashRepo.restore(kind, id))

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
      throw new Error('⌘⇧Space를 다른 앱이 이미 쓰고 있어 켤 수 없습니다.')
    }
    return next
  })

  // ---- Claude Code (MCP) ----
  handle(IPC.mcp.info, () => {
    // The server runs on this app's own Electron binary in Node mode, so the bundled
    // SQLite module matches and nothing else needs installing.
    const script = join(app.getAppPath(), 'out', 'mcp', 'server.js')
    const q = (s: string): string => `"${s.replace(/"/g, '\\"')}"`
    return {
      command: [
        'claude mcp add aop-note --scope user',
        '-e ELECTRON_RUN_AS_NODE=1',
        `-e AOP_NOTE_DATA=${q(app.getPath('userData'))}`,
        `-- ${q(process.execPath)} ${q(script)}`
      ].join(' ')
    }
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
    if (process.platform !== 'darwin') {
      const backdrop = theme === 'dark' ? '#0b0b0f' : '#eef0f4'
      for (const win of BrowserWindow.getAllWindows()) win.setBackgroundColor(backdrop)
    }
  })
}
