// Domain types shared between main (DB) and renderer (UI).
// Keep this file free of any Node/Electron imports — it is consumed by both sides.

export type TaskStatus = 'todo' | 'doing' | 'done'

/** Priority: 0 = none, 1 = low, 2 = medium, 3 = high */
export type Priority = 0 | 1 | 2 | 3

export interface Workspace {
  id: string
  name: string
  color: string
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
}

export interface UpdateWorkspaceInput {
  id: string
  name?: string
  color?: string
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
