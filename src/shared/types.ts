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
