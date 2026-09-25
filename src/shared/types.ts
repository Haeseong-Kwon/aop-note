// Domain types shared between main (DB) and renderer (UI).
// Keep this file free of any Node/Electron imports — it is consumed by both sides.

export type TaskStatus = 'todo' | 'doing' | 'done'

/** Priority: 0 = none, 1 = low, 2 = medium, 3 = high */
export type Priority = 0 | 1 | 2 | 3

/** Repeat rule: completing the task schedules the next occurrence. */
export type Recurrence = 'daily' | 'weekdays' | 'weekly' | 'monthly'

export interface Workspace {
  id: string
  name: string
  color: string
  /** Emoji shown in place of the colored dot. Empty string = use the colored dot. */
  icon: string
  sort_order: number
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Category {
  id: string
  workspace_id: string
  name: string
  color: string
  parent_id: string | null
  sort_order: number
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Task {
  id: string
  category_id: string
  goal_id: string | null
  title: string
  note: string
  status: TaskStatus
  priority: Priority
  due_date: string | null
  recurrence: Recurrence | null
  /** When to send a reminder notification (ISO), or null. */
  remind_at: string | null
  sort_order: number
  created_at: string
  updated_at: string
  completed_at: string | null
  deleted_at: string | null
}

export interface Goal {
  id: string
  workspace_id: string
  title: string
  description: string
  due_date: string | null
  status: TaskStatus
  sort_order: number
  created_at: string
  updated_at: string
  completed_at: string | null
  deleted_at: string | null
}

/** Goal enriched with progress derived from its linked tasks. */
export interface GoalWithProgress extends Goal {
  total_tasks: number
  done_tasks: number
  /** 0..1 completion ratio of linked tasks (0 when no tasks linked). */
  progress: number
}

/** Task joined with its category + workspace, for cross-workspace views. */
export interface TaskWithContext extends Task {
  category_name: string
  category_color: string
  workspace_id: string
  workspace_name: string
  workspace_color: string
}

export interface Attachment {
  id: string
  task_id: string
  file_name: string // original name as uploaded
  ext: string // lowercase, no dot (e.g. "pdf")
  mime: string
  size: number // bytes
  stored_name: string // filename on disk under userData/attachments
  created_at: string
  updated_at: string
  deleted_at: string | null
}

/** Attachment joined with its task + category, for the desk-wide document library. */
export interface AttachmentWithContext extends Attachment {
  task_title: string
  category_id: string
  category_name: string
  category_color: string
}

export type ExportFormat = 'md' | 'html' | 'pdf'

export interface ExportResult {
  canceled: boolean
  path?: string
}

export interface AttachmentAddInput {
  task_id: string
  source_path: string
  file_name: string
}

/** Result of rendering an attachment for the in-app viewer. */
export type AttachmentRender =
  | { kind: 'pdf'; url: string }
  | { kind: 'image'; url: string }
  | { kind: 'html'; html: string }
  | { kind: 'sheets'; sheets: { name: string; html: string }[] }
  | { kind: 'text'; text: string }
  | { kind: 'unsupported'; reason: string }

/** A hit in the command palette / quick switcher. */
export interface SearchHit {
  type: 'task' | 'category' | 'workspace'
  id: string
  title: string
  subtitle: string
  color: string
  workspace_id: string
  category_id: string | null
}

// ---- Input payloads (renderer -> main) ----

export interface CreateWorkspaceInput {
  name: string
  color?: string
  icon?: string
}

export interface UpdateWorkspaceInput {
  id: string
  name?: string
  color?: string
  icon?: string
  sort_order?: number
}

export interface CreateCategoryInput {
  workspace_id: string
  name: string
  color?: string
  parent_id?: string | null
}

export interface UpdateCategoryInput {
  id: string
  name?: string
  color?: string
  parent_id?: string | null
  sort_order?: number
}

export interface CreateTaskInput {
  category_id: string
  goal_id?: string | null
  title: string
  note?: string
  status?: TaskStatus
  priority?: Priority
  due_date?: string | null
  recurrence?: Recurrence | null
  remind_at?: string | null
}

export interface UpdateTaskInput {
  id: string
  title?: string
  note?: string
  status?: TaskStatus
  priority?: Priority
  due_date?: string | null
  sort_order?: number
  category_id?: string
  goal_id?: string | null
  recurrence?: Recurrence | null
  remind_at?: string | null
}

export interface CreateGoalInput {
  workspace_id: string
  title: string
  description?: string
  due_date?: string | null
  status?: TaskStatus
}

export interface UpdateGoalInput {
  id: string
  title?: string
  description?: string
  due_date?: string | null
  status?: TaskStatus
  sort_order?: number
}

export type TrashKind = 'workspace' | 'category' | 'task'

/**
 * One delete action as shown in the trash. A cascading delete (desk → categories
 * → tasks) stamps every row with the same deleted_at, so only its top item is listed.
 */
export interface TrashItem {
  kind: TrashKind
  id: string
  title: string
  /** Where it lived, e.g. "마케팅 / 캠페인". Empty for a desk. */
  context: string
  color: string
  deleted_at: string
  /** Tasks removed in the same delete (1 for a task). */
  task_count: number
}

/** App-level preferences, persisted by main in userData/settings.json. */
export interface AppSettings {
  /** Start the app when the user logs in. */
  launchAtLogin: boolean
  /** Notify about tasks due today. Per-task reminders fire regardless. */
  dueNotifications: boolean
  /** System-wide ⌘⇧Space quick capture. */
  globalShortcut: boolean
  /** Folder the Obsidian-style Markdown mirror is written into ('' = off). */
  vaultPath: string
}

/** How to register the bundled MCP server with Claude Code. */
export interface McpInfo {
  /** One-line `claude mcp add …` command to paste into a terminal. */
  command: string
}

export interface BackupInfo {
  /** Absolute path of the folder holding the database and attachments. */
  data_dir: string
  /** Date (YYYY-MM-DD) of the newest automatic backup, or null if none yet. */
  last_auto_backup: string | null
}

export interface BacklinkHit {
  task: TaskWithContext
  /** The line of the other note where the link / mention appears. */
  snippet: string
}

export interface Backlinks {
  /** Notes with a [[link]] to this one. */
  linked: BacklinkHit[]
  /** Notes that mention this title as plain text (candidates for a link). */
  mentions: BacklinkHit[]
}

export interface GraphNode {
  /** Task id, or "ghost:<title>" for a linked note that doesn't exist yet. */
  id: string
  title: string
  color: string
  ghost: boolean
  /** Where the note lives (null for a ghost). */
  workspace_id: string | null
  workspace_name: string | null
  category_id: string | null
  /** Number of distinct neighbours. */
  links: number
}

export interface GraphData {
  nodes: GraphNode[]
  edges: { source: string; target: string }[]
}
