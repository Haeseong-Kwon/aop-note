// Canonical IPC channel names + the typed shape of window.api.
// Single source of truth so main, preload, and renderer never drift.

import type {
  Workspace,
  Category,
  Task,
  TaskWithContext,
  GoalWithProgress,
  SearchHit,
  Attachment,
  AttachmentWithContext,
  AttachmentAddInput,
  AttachmentRender,
  ExportFormat,
  ExportResult,
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

/** Payload sent from main → renderer when a notification is clicked. */
export interface NavigatePayload {
  workspace_id: string
  category_id: string
  task_id: string
}

export const IPC = {
  workspace: {
    list: 'workspace:list',
    create: 'workspace:create',
    update: 'workspace:update',
    reorder: 'workspace:reorder',
    remove: 'workspace:remove'
  },
  category: {
    listByWorkspace: 'category:listByWorkspace',
    create: 'category:create',
    update: 'category:update',
    reorder: 'category:reorder',
    remove: 'category:remove'
  },
  task: {
    listByCategory: 'task:listByCategory',
    listByWorkspace: 'task:listByWorkspace',
    listUpcoming: 'task:listUpcoming',
    create: 'task:create',
    update: 'task:update',
    setStatus: 'task:setStatus',
    reorder: 'task:reorder',
    remove: 'task:remove'
  },
  goal: {
    listByWorkspace: 'goal:listByWorkspace',
    create: 'goal:create',
    update: 'goal:update',
    remove: 'goal:remove'
  },
  search: {
    query: 'search:query'
  },
  memo: {
    export: 'memo:export'
  },
  attachment: {
    listByTask: 'attachment:listByTask',
    listByWorkspace: 'attachment:listByWorkspace',
    add: 'attachment:add',
    addBytes: 'attachment:addBytes',
    findByUrl: 'attachment:findByUrl',
    render: 'attachment:render',
    openExternal: 'attachment:openExternal',
    remove: 'attachment:remove'
  },
  theme: {
    set: 'theme:set'
  },
  events: {
    navigateToTask: 'event:navigateToTask'
  }
} as const

// The API surface exposed on window.api via contextBridge.
export interface Api {
  workspace: {
    list(): Promise<Workspace[]>
    create(input: CreateWorkspaceInput): Promise<Workspace>
    update(input: UpdateWorkspaceInput): Promise<Workspace>
    reorder(updates: UpdateWorkspaceInput[]): Promise<void>
    remove(id: string): Promise<void>
  }
  category: {
    listByWorkspace(workspaceId: string): Promise<Category[]>
    create(input: CreateCategoryInput): Promise<Category>
    update(input: UpdateCategoryInput): Promise<Category>
    reorder(updates: UpdateCategoryInput[]): Promise<void>
    remove(id: string): Promise<void>
  }
  task: {
    listByCategory(categoryId: string): Promise<Task[]>
    listByWorkspace(workspaceId: string): Promise<Task[]>
    /** Cross-workspace tasks with due_date on or before endIso (overdue included). */
    listUpcoming(endIso: string): Promise<TaskWithContext[]>
    create(input: CreateTaskInput): Promise<Task>
    update(input: UpdateTaskInput): Promise<Task>
    setStatus(id: string, status: TaskStatus, sortOrder?: number): Promise<Task>
    reorder(updates: UpdateTaskInput[]): Promise<void>
    remove(id: string): Promise<void>
  }
  goal: {
    listByWorkspace(workspaceId: string): Promise<GoalWithProgress[]>
    create(input: CreateGoalInput): Promise<GoalWithProgress>
    update(input: UpdateGoalInput): Promise<GoalWithProgress>
    remove(id: string): Promise<void>
  }
  search: {
    query(text: string): Promise<SearchHit[]>
  }
  memo: {
    /** Export a task's memo (title + note) to a file the user picks. */
    export(taskId: string, format: ExportFormat): Promise<ExportResult>
  }
  attachment: {
    listByTask(taskId: string): Promise<Attachment[]>
    listByWorkspace(workspaceId: string): Promise<AttachmentWithContext[]>
    add(input: AttachmentAddInput): Promise<Attachment>
    /** Store bytes from a memo drop/paste; resolves to the `aop-file://` URL to embed. */
    addBytes(taskId: string, fileName: string, bytes: ArrayBuffer): Promise<string>
    /** Resolve an `aop-file://` URL embedded in a memo to its attachment record. */
    findByUrl(url: string): Promise<Attachment | null>
    render(id: string): Promise<AttachmentRender>
    openExternal(id: string): Promise<void>
    remove(id: string): Promise<void>
  }
  /**
   * Tell main which appearance the UI is showing, so the native window backdrop
   * (macOS vibrancy / other platforms' background) matches. Without this the
   * backdrop follows the OS, and light UI over a dark blur reads as grey mud.
   */
  setTheme(theme: 'light' | 'dark'): Promise<void>
  /** Electron 32+: resolve the absolute filesystem path of a picked/dropped File. */
  getPathForFile(file: File): string
  /** Subscribe to "open this task" requests from notification clicks. Returns an unsubscribe fn. */
  onNavigateToTask(cb: (payload: NavigatePayload) => void): () => void
}
