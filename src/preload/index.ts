import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'
import type { Api } from '@shared/ipc'
import type {
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
  CreateCategoryInput,
  UpdateCategoryInput,
  CreateTaskInput,
  UpdateTaskInput,
  CreateGoalInput,
  UpdateGoalInput,
  TaskStatus
} from '@shared/types'

// The only bridge between renderer and main. No Node globals leak to the page.
const api: Api = {
  workspace: {
    list: () => ipcRenderer.invoke(IPC.workspace.list),
    create: (input: CreateWorkspaceInput) => ipcRenderer.invoke(IPC.workspace.create, input),
    update: (input: UpdateWorkspaceInput) => ipcRenderer.invoke(IPC.workspace.update, input),
    remove: (id: string) => ipcRenderer.invoke(IPC.workspace.remove, id)
  },
  category: {
    listByWorkspace: (workspaceId: string) =>
      ipcRenderer.invoke(IPC.category.listByWorkspace, workspaceId),
    create: (input: CreateCategoryInput) => ipcRenderer.invoke(IPC.category.create, input),
    update: (input: UpdateCategoryInput) => ipcRenderer.invoke(IPC.category.update, input),
    remove: (id: string) => ipcRenderer.invoke(IPC.category.remove, id)
  },
  task: {
    listByCategory: (categoryId: string) =>
      ipcRenderer.invoke(IPC.task.listByCategory, categoryId),
    listByWorkspace: (workspaceId: string) =>
      ipcRenderer.invoke(IPC.task.listByWorkspace, workspaceId),
    create: (input: CreateTaskInput) => ipcRenderer.invoke(IPC.task.create, input),
    update: (input: UpdateTaskInput) => ipcRenderer.invoke(IPC.task.update, input),
    setStatus: (id: string, status: TaskStatus, sortOrder?: number) =>
      ipcRenderer.invoke(IPC.task.setStatus, id, status, sortOrder),
    remove: (id: string) => ipcRenderer.invoke(IPC.task.remove, id)
  },
  goal: {
    listByWorkspace: (workspaceId: string) =>
      ipcRenderer.invoke(IPC.goal.listByWorkspace, workspaceId),
    create: (input: CreateGoalInput) => ipcRenderer.invoke(IPC.goal.create, input),
    update: (input: UpdateGoalInput) => ipcRenderer.invoke(IPC.goal.update, input),
    remove: (id: string) => ipcRenderer.invoke(IPC.goal.remove, id)
  }
}

contextBridge.exposeInMainWorld('api', api)
