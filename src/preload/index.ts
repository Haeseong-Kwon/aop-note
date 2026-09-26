import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import { IPC } from '@shared/ipc'
import type { Api, NavigatePayload } from '@shared/ipc'
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

// The only bridge between renderer and main. No Node globals leak to the page.
const api: Api = {
  workspace: {
    list: () => ipcRenderer.invoke(IPC.workspace.list),
    create: (input: CreateWorkspaceInput) => ipcRenderer.invoke(IPC.workspace.create, input),
    update: (input: UpdateWorkspaceInput) => ipcRenderer.invoke(IPC.workspace.update, input),
    reorder: (updates: UpdateWorkspaceInput[]) => ipcRenderer.invoke(IPC.workspace.reorder, updates),
    remove: (id: string) => ipcRenderer.invoke(IPC.workspace.remove, id)
  },
  category: {
    listByWorkspace: (workspaceId: string) =>
      ipcRenderer.invoke(IPC.category.listByWorkspace, workspaceId),
    create: (input: CreateCategoryInput) => ipcRenderer.invoke(IPC.category.create, input),
    update: (input: UpdateCategoryInput) => ipcRenderer.invoke(IPC.category.update, input),
    reorder: (updates: UpdateCategoryInput[]) => ipcRenderer.invoke(IPC.category.reorder, updates),
    remove: (id: string) => ipcRenderer.invoke(IPC.category.remove, id)
  },
  task: {
    listByCategory: (categoryId: string) =>
      ipcRenderer.invoke(IPC.task.listByCategory, categoryId),
    listByWorkspace: (workspaceId: string) =>
      ipcRenderer.invoke(IPC.task.listByWorkspace, workspaceId),
    listUpcoming: (endIso: string) => ipcRenderer.invoke(IPC.task.listUpcoming, endIso),
    create: (input: CreateTaskInput) => ipcRenderer.invoke(IPC.task.create, input),
    update: (input: UpdateTaskInput) => ipcRenderer.invoke(IPC.task.update, input),
    setStatus: (id: string, status: TaskStatus, sortOrder?: number) =>
      ipcRenderer.invoke(IPC.task.setStatus, id, status, sortOrder),
    reorder: (updates: UpdateTaskInput[]) => ipcRenderer.invoke(IPC.task.reorder, updates),
    remove: (id: string) => ipcRenderer.invoke(IPC.task.remove, id)
  },
  goal: {
    listByWorkspace: (workspaceId: string) =>
      ipcRenderer.invoke(IPC.goal.listByWorkspace, workspaceId),
    create: (input: CreateGoalInput) => ipcRenderer.invoke(IPC.goal.create, input),
    update: (input: UpdateGoalInput) => ipcRenderer.invoke(IPC.goal.update, input),
    remove: (id: string) => ipcRenderer.invoke(IPC.goal.remove, id)
  },
  search: {
    query: (text: string) => ipcRenderer.invoke(IPC.search.query, text)
  },
  memo: {
    export: (taskId: string, format: ExportFormat) =>
      ipcRenderer.invoke(IPC.memo.export, taskId, format)
  },
  attachment: {
    listByTask: (taskId: string) => ipcRenderer.invoke(IPC.attachment.listByTask, taskId),
    listByWorkspace: (workspaceId: string) =>
      ipcRenderer.invoke(IPC.attachment.listByWorkspace, workspaceId),
    add: (input: AttachmentAddInput) => ipcRenderer.invoke(IPC.attachment.add, input),
    addBytes: (taskId: string, fileName: string, bytes: ArrayBuffer) =>
      ipcRenderer.invoke(IPC.attachment.addBytes, taskId, fileName, bytes),
    findByUrl: (url: string) => ipcRenderer.invoke(IPC.attachment.findByUrl, url),
    render: (id: string) => ipcRenderer.invoke(IPC.attachment.render, id),
    openExternal: (id: string) => ipcRenderer.invoke(IPC.attachment.openExternal, id),
    remove: (id: string) => ipcRenderer.invoke(IPC.attachment.remove, id)
  },
  link: {
    backlinks: (taskId: string) => ipcRenderer.invoke(IPC.link.backlinks, taskId),
    graph: () => ipcRenderer.invoke(IPC.link.graph),
    resolve: (title: string, fromTaskId: string | null) =>
      ipcRenderer.invoke(IPC.link.resolve, title, fromTaskId),
    fileBacklinks: (deskId: string, path: string) => ipcRenderer.invoke(IPC.link.fileBacklinks, deskId, path)
  },
  project: {
    list: () => ipcRenderer.invoke(IPC.project.list),
    choose: (deskId: string) => ipcRenderer.invoke(IPC.project.choose, deskId),
    unlink: (deskId: string) => ipcRenderer.invoke(IPC.project.unlink, deskId),
    overview: (deskId: string) => ipcRenderer.invoke(IPC.project.overview, deskId),
    readFile: (deskId: string, path: string) => ipcRenderer.invoke(IPC.project.readFile, deskId, path),
    reveal: (deskId: string, path?: string) => ipcRenderer.invoke(IPC.project.reveal, deskId, path),
    openInClaude: (deskId: string) => ipcRenderer.invoke(IPC.project.openInClaude, deskId)
  },
  trash: {
    list: () => ipcRenderer.invoke(IPC.trash.list),
    restore: (kind: TrashKind, id: string) => ipcRenderer.invoke(IPC.trash.restore, kind, id)
  },
  calendar: {
    list: () => ipcRenderer.invoke(IPC.calendar.list),
    subscribe: (input: { name: string; url: string; color: string }) =>
      ipcRenderer.invoke(IPC.calendar.subscribe, input),
    unsubscribe: (id: string) => ipcRenderer.invoke(IPC.calendar.unsubscribe, id),
    sync: (id?: string) => ipcRenderer.invoke(IPC.calendar.sync, id),
    events: (fromIso: string, toIso: string) => ipcRenderer.invoke(IPC.calendar.events, fromIso, toIso)
  },
  mcp: {
    info: () => ipcRenderer.invoke(IPC.mcp.info),
    setHook: (enabled: boolean) => ipcRenderer.invoke(IPC.mcp.setHook, enabled)
  },
  vault: {
    choose: () => ipcRenderer.invoke(IPC.vault.choose),
    sync: () => ipcRenderer.invoke(IPC.vault.sync),
    disable: () => ipcRenderer.invoke(IPC.vault.disable),
    open: () => ipcRenderer.invoke(IPC.vault.open)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settings.get),
    update: (patch: Partial<AppSettings>) => ipcRenderer.invoke(IPC.settings.update, patch)
  },
  backup: {
    info: () => ipcRenderer.invoke(IPC.backup.info),
    export: () => ipcRenderer.invoke(IPC.backup.export),
    restore: () => ipcRenderer.invoke(IPC.backup.restore),
    openDataFolder: () => ipcRenderer.invoke(IPC.backup.openDataFolder)
  },
  setTheme: (theme: 'light' | 'dark') => ipcRenderer.invoke(IPC.theme.set, theme),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  onNavigateToTask: (cb: (payload: NavigatePayload) => void) => {
    const listener = (_e: IpcRendererEvent, payload: NavigatePayload): void => cb(payload)
    ipcRenderer.on(IPC.events.navigateToTask, listener)
    return () => ipcRenderer.removeListener(IPC.events.navigateToTask, listener)
  },
  onQuickCapture: (cb: () => void) => {
    const listener = (): void => cb()
    ipcRenderer.on(IPC.events.quickCapture, listener)
    return () => ipcRenderer.removeListener(IPC.events.quickCapture, listener)
  },
  onProjectChanged: (cb: (deskId: string) => void) => {
    const listener = (_e: IpcRendererEvent, deskId: string): void => cb(deskId)
    ipcRenderer.on(IPC.events.projectChanged, listener)
    return () => ipcRenderer.removeListener(IPC.events.projectChanged, listener)
  },
  onCalendarsSynced: (cb: () => void) => {
    const listener = (): void => cb()
    ipcRenderer.on(IPC.events.calendarsSynced, listener)
    return () => ipcRenderer.removeListener(IPC.events.calendarsSynced, listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
