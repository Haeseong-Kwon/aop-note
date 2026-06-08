// Canonical IPC channel names + the typed shape of window.api.
// Single source of truth so main, preload, and renderer never drift.

import type {
  Workspace,
  Category,
  Task,
  GoalWithProgress,
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
  CreateCategoryInput,
  UpdateCategoryInput,
  CreateTaskInput,
  UpdateTaskInput,
  CreateGoalInput,
  UpdateGoalInput,
  TaskStatus
} from './types'

export const IPC = {
  workspace: {
    list: 'workspace:list',
    create: 'workspace:create',
    update: 'workspace:update',
    remove: 'workspace:remove'
  },
  category: {
    listByWorkspace: 'category:listByWorkspace',
    create: 'category:create',
    update: 'category:update',
    remove: 'category:remove'
  },
  task: {
    listByCategory: 'task:listByCategory',
    listByWorkspace: 'task:listByWorkspace',
    create: 'task:create',
    update: 'task:update',
    setStatus: 'task:setStatus',
    remove: 'task:remove'
  },
  goal: {
    listByWorkspace: 'goal:listByWorkspace',
    create: 'goal:create',
    update: 'goal:update',
    remove: 'goal:remove'
  }
} as const

// The API surface exposed on window.api via contextBridge.
export interface Api {
  workspace: {
    list(): Promise<Workspace[]>
    create(input: CreateWorkspaceInput): Promise<Workspace>
    update(input: UpdateWorkspaceInput): Promise<Workspace>
    remove(id: string): Promise<void>
  }
  category: {
    listByWorkspace(workspaceId: string): Promise<Category[]>
    create(input: CreateCategoryInput): Promise<Category>
    update(input: UpdateCategoryInput): Promise<Category>
    remove(id: string): Promise<void>
  }
  task: {
    listByCategory(categoryId: string): Promise<Task[]>
    listByWorkspace(workspaceId: string): Promise<Task[]>
    create(input: CreateTaskInput): Promise<Task>
    update(input: UpdateTaskInput): Promise<Task>
    setStatus(id: string, status: TaskStatus, sortOrder?: number): Promise<Task>
    remove(id: string): Promise<void>
  }
  goal: {
    listByWorkspace(workspaceId: string): Promise<GoalWithProgress[]>
    create(input: CreateGoalInput): Promise<GoalWithProgress>
    update(input: UpdateGoalInput): Promise<GoalWithProgress>
    remove(id: string): Promise<void>
  }
}
