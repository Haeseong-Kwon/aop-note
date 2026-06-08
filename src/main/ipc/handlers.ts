import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import { workspaceRepo } from '../repositories/workspace.repo'
import { categoryRepo } from '../repositories/category.repo'
import { taskRepo } from '../repositories/task.repo'
import { goalRepo } from '../repositories/goal.repo'
import { searchRepo } from '../repositories/search.repo'
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

// Wraps a handler so any thrown error is logged in main and surfaced to the
// renderer as a rejected promise (instead of a silent failure).
function handle<T>(channel: string, fn: (...args: never[]) => T): void {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return await fn(...(args as never[]))
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
}
