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
  TaskStatus
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
    render: (id: string) => ipcRenderer.invoke(IPC.attachment.render, id),
    openExternal: (id: string) => ipcRenderer.invoke(IPC.attachment.openExternal, id),
    remove: (id: string) => ipcRenderer.invoke(IPC.attachment.remove, id)
  },
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  onNavigateToTask: (cb: (payload: NavigatePayload) => void) => {
    const listener = (_e: IpcRendererEvent, payload: NavigatePayload): void => cb(payload)
    ipcRenderer.on(IPC.events.navigateToTask, listener)
    return () => ipcRenderer.removeListener(IPC.events.navigateToTask, listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
