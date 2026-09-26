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
  TaskStatus,
  TrashItem,
  TrashKind,
  BackupInfo,
  AppSettings,
  Backlinks,
  GraphData,
  McpInfo,
  FileBacklinks,
  ProjectOverview,
  ProjectFile,
  ProjectSummary,
  CalendarInfo,
  CalendarEvent,
  LinkPreview,
  DatabaseData,
  Property,
  PropertyType,
  SelectOption,
  SyncedBlock,
  SyncedBlockSummary,
  AiRequest,
  AiResult,
  AiStatus
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
    remove: 'task:remove',
    duplicate: 'task:duplicate'
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
  link: {
    backlinks: 'link:backlinks',
    graph: 'link:graph',
    resolve: 'link:resolve',
    fileBacklinks: 'link:fileBacklinks',
    preview: 'link:preview'
  },
  project: {
    list: 'project:list',
    choose: 'project:choose',
    unlink: 'project:unlink',
    overview: 'project:overview',
    readFile: 'project:readFile',
    reveal: 'project:reveal',
    openInClaude: 'project:openInClaude'
  },
  trash: {
    list: 'trash:list',
    restore: 'trash:restore'
  },
  ai: {
    status: 'ai:status',
    run: 'ai:run',
    cancel: 'ai:cancel',
    setKey: 'ai:setKey'
  },
  synced: {
    create: 'synced:create',
    get: 'synced:get',
    save: 'synced:save',
    list: 'synced:list'
  },
  database: {
    get: 'database:get',
    createProperty: 'database:createProperty',
    updateProperty: 'database:updateProperty',
    removeProperty: 'database:removeProperty',
    setValue: 'database:setValue'
  },
  calendar: {
    list: 'calendar:list',
    subscribe: 'calendar:subscribe',
    unsubscribe: 'calendar:unsubscribe',
    sync: 'calendar:sync',
    events: 'calendar:events'
  },
  mcp: {
    info: 'mcp:info',
    setHook: 'mcp:setHook'
  },
  vault: {
    choose: 'vault:choose',
    sync: 'vault:sync',
    disable: 'vault:disable',
    open: 'vault:open'
  },
  settings: {
    get: 'settings:get',
    update: 'settings:update'
  },
  backup: {
    info: 'backup:info',
    export: 'backup:export',
    restore: 'backup:restore',
    openDataFolder: 'backup:openDataFolder'
  },
  events: {
    navigateToTask: 'event:navigateToTask',
    quickCapture: 'event:quickCapture',
    projectChanged: 'event:projectChanged',
    calendarsSynced: 'event:calendarsSynced',
    syncedChanged: 'event:syncedChanged',
    aiDelta: 'event:aiDelta'
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
    /** Copy content, formatting and page settings into a new one-off task. */
    duplicate(id: string): Promise<Task>
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
  link: {
    backlinks(taskId: string): Promise<Backlinks>
    graph(): Promise<GraphData>
    /** The note a [[title]] in fromTaskId's memo points at, or null if none exists yet. */
    resolve(title: string, fromTaskId: string | null): Promise<TaskWithContext | null>
    fileBacklinks(deskId: string, path: string): Promise<FileBacklinks>
    /** Title / description / image of a web page, for a bookmark block. */
    preview(url: string): Promise<LinkPreview>
  }
  project: {
    /** Desks with a linked folder, with git / docs summary. */
    list(): Promise<ProjectSummary[]>
    /** Pick a folder to link to the desk. Null if cancelled. */
    choose(deskId: string): Promise<Workspace | null>
    unlink(deskId: string): Promise<Workspace>
    overview(deskId: string): Promise<ProjectOverview | null>
    /** Read an indexed document (other paths are refused). */
    readFile(deskId: string, path: string): Promise<ProjectFile>
    reveal(deskId: string, path?: string): Promise<void>
    /** Open a terminal in the folder running `claude`. */
    openInClaude(deskId: string): Promise<void>
  }
  trash: {
    list(): Promise<TrashItem[]>
    /** Restore one delete (and any deleted parent it needs to be visible). */
    restore(kind: TrashKind, id: string): Promise<void>
  }
  ai: {
    status(): Promise<AiStatus>
    /** Streams text through onAiDelta(request.id, …); resolves with the full result. */
    run(request: AiRequest): Promise<AiResult>
    cancel(id: string): Promise<void>
    /** Store (or with null, forget) the Anthropic API key in the OS keychain. */
    setKey(key: string | null): Promise<AiStatus>
  }
  synced: {
    create(): Promise<SyncedBlock>
    get(id: string): Promise<SyncedBlock | null>
    /** Save shared content; every open copy is told via onSyncedChanged. */
    save(id: string, md: string, blocks: unknown[], source: string): Promise<SyncedBlock>
    list(): Promise<SyncedBlockSummary[]>
  }
  database: {
    /** A desk's tasks with their custom property values. */
    get(workspaceId: string): Promise<DatabaseData>
    createProperty(input: { workspace_id: string; name: string; type: PropertyType }): Promise<Property>
    updateProperty(input: { id: string; name?: string; options?: SelectOption[] }): Promise<Property>
    removeProperty(id: string): Promise<void>
    /** null clears the cell. */
    setValue(taskId: string, propertyId: string, value: unknown): Promise<void>
  }
  calendar: {
    list(): Promise<CalendarInfo[]>
    /** Fetches once to validate; rejects (and stores nothing) if the feed can't be read. */
    subscribe(input: { name: string; url: string; color: string }): Promise<CalendarInfo>
    unsubscribe(id: string): Promise<void>
    /** Re-fetch one calendar, or all of them. */
    sync(id?: string): Promise<CalendarInfo[]>
    events(fromIso: string, toIso: string): Promise<CalendarEvent[]>
  }
  mcp: {
    info(): Promise<McpInfo>
    /** Add/remove the SessionStart hook in ~/.claude/settings.json; resolves to the new state. */
    setHook(enabled: boolean): Promise<boolean>
  }
  vault: {
    /** Pick a folder, start mirroring into <folder>/AOP Note/. Null if cancelled. */
    choose(): Promise<AppSettings | null>
    /** Write the mirror now; resolves to the number of files it manages. */
    sync(): Promise<number>
    disable(): Promise<AppSettings>
    open(): Promise<void>
  }
  settings: {
    get(): Promise<AppSettings>
    /** Save and apply (login item, global shortcut). Resolves to the stored settings. */
    update(patch: Partial<AppSettings>): Promise<AppSettings>
  }
  backup: {
    info(): Promise<BackupInfo>
    /** Pick a folder and write a backup into it; resolves to its path, or null if cancelled. */
    export(): Promise<string | null>
    /** Pick a backup folder, confirm, replace all data and relaunch. False if cancelled. */
    restore(): Promise<boolean>
    openDataFolder(): Promise<void>
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
  /** Subscribe to the system-wide quick-capture shortcut / menu-bar item. */
  onQuickCapture(cb: () => void): () => void
  /** A linked project folder's docs or git state changed on disk. */
  onProjectChanged(cb: (deskId: string) => void): () => void
  /** Subscribed calendars were re-fetched in the background. */
  onCalendarsSynced(cb: () => void): () => void
  /** A synced block's content changed (id, and the save's source so it can ignore its own echo). */
  onSyncedChanged(cb: (id: string, source: string) => void): () => void
  /** A chunk of streamed AI output for request `id`. */
  onAiDelta(cb: (id: string, text: string) => void): () => void
}
