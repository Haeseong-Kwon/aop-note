import { create } from 'zustand'
import type {
  Workspace,
  Category,
  Task,
  GoalWithProgress,
  TaskStatus,
  CreateTaskInput,
  UpdateTaskInput,
  CreateCategoryInput,
  CreateGoalInput,
  UpdateGoalInput
} from '@shared/types'

export type ViewMode = 'list' | 'kanban'
export type MainView = 'tasks' | 'calendar' | 'goals'

interface AppState {
  // data
  workspaces: Workspace[]
  categories: Category[]
  tasks: Task[] // all (non-deleted) tasks of the active workspace
  goals: GoalWithProgress[]

  // selection / ui
  activeWorkspaceId: string | null
  activeCategoryId: string | null
  mainView: MainView
  view: ViewMode
  expandedTaskId: string | null
  quickCaptureOpen: boolean
  calYear: number
  calMonth: number // 0-based
  loading: boolean
  error: string | null

  // bootstrap & selection
  init: () => Promise<void>
  selectWorkspace: (id: string) => Promise<void>
  selectCategory: (id: string | null) => void
  setMainView: (view: MainView) => void
  setView: (view: ViewMode) => void

  // workspace / category mutations
  createWorkspace: (name: string) => Promise<void>
  createCategory: (input: Omit<CreateCategoryInput, 'workspace_id'>) => Promise<void>
  deleteCategory: (id: string) => Promise<void>

  // task mutations
  createTask: (input: CreateTaskInput) => Promise<Task | null>
  updateTask: (input: UpdateTaskInput) => Promise<void>
  toggleDone: (task: Task) => Promise<void>
  moveTask: (id: string, status: TaskStatus, sortOrder: number) => Promise<void>
  deleteTask: (id: string) => Promise<void>

  // goal mutations
  createGoal: (input: Omit<CreateGoalInput, 'workspace_id'>) => Promise<void>
  updateGoal: (input: UpdateGoalInput) => Promise<void>
  deleteGoal: (id: string) => Promise<void>
  toggleGoalDone: (goal: GoalWithProgress) => Promise<void>

  // inline detail + quick capture + calendar nav
  toggleExpand: (id: string) => void
  collapse: () => void
  focusTask: (task: Task) => void
  openQuickCapture: () => void
  closeQuickCapture: () => void
  shiftMonth: (delta: number) => void
  goToToday: () => void
}

async function reloadWorkspaceData(
  workspaceId: string
): Promise<{ categories: Category[]; tasks: Task[]; goals: GoalWithProgress[] }> {
  const [categories, tasks, goals] = await Promise.all([
    window.api.category.listByWorkspace(workspaceId),
    window.api.task.listByWorkspace(workspaceId),
    window.api.goal.listByWorkspace(workspaceId)
  ])
  return { categories, tasks, goals }
}

const today = new Date()

export const useStore = create<AppState>((set, get) => ({
  workspaces: [],
  categories: [],
  tasks: [],
  goals: [],
  activeWorkspaceId: null,
  activeCategoryId: null,
  mainView: 'tasks',
  view: 'list',
  expandedTaskId: null,
  quickCaptureOpen: false,
  calYear: today.getFullYear(),
  calMonth: today.getMonth(),
  loading: true,
  error: null,

  init: async () => {
    try {
      set({ loading: true, error: null })
      const workspaces = await window.api.workspace.list()
      set({ workspaces })
      if (workspaces.length > 0) {
        await get().selectWorkspace(workspaces[0].id)
      }
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    } finally {
      set({ loading: false })
    }
  },

  selectWorkspace: async (id) => {
    const { categories, tasks, goals } = await reloadWorkspaceData(id)
    set({
      activeWorkspaceId: id,
      categories,
      tasks,
      goals,
      activeCategoryId: categories[0]?.id ?? null,
      expandedTaskId: null
    })
  },

  selectCategory: (id) => set({ activeCategoryId: id, expandedTaskId: null }),
  setMainView: (mainView) => set({ mainView, expandedTaskId: null }),
  setView: (view) => set({ view, expandedTaskId: null }),

  createWorkspace: async (name) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const ws = await window.api.workspace.create({ name: trimmed })
    set((s) => ({ workspaces: [...s.workspaces, ws] }))
    await get().selectWorkspace(ws.id)
  },

  createCategory: async (input) => {
    const workspaceId = get().activeWorkspaceId
    if (!workspaceId) return
    const trimmed = input.name.trim()
    if (!trimmed) return
    await window.api.category.create({ ...input, name: trimmed, workspace_id: workspaceId })
    const data = await reloadWorkspaceData(workspaceId)
    set({ categories: data.categories, tasks: data.tasks, goals: data.goals })
  },

  deleteCategory: async (id) => {
    const workspaceId = get().activeWorkspaceId
    if (!workspaceId) return
    await window.api.category.remove(id)
    const data = await reloadWorkspaceData(workspaceId)
    set((s) => ({
      categories: data.categories,
      tasks: data.tasks,
      goals: data.goals,
      activeCategoryId:
        s.activeCategoryId === id ? (data.categories[0]?.id ?? null) : s.activeCategoryId
    }))
  },

  createTask: async (input) => {
    const workspaceId = get().activeWorkspaceId
    if (!workspaceId) return null
    const task = await window.api.task.create(input)
    const data = await reloadWorkspaceData(workspaceId)
    set({ tasks: data.tasks, goals: data.goals })
    return task
  },

  updateTask: async (input) => {
    const workspaceId = get().activeWorkspaceId
    if (!workspaceId) return
    await window.api.task.update(input)
    const data = await reloadWorkspaceData(workspaceId)
    set({ tasks: data.tasks, goals: data.goals })
  },

  toggleDone: async (task) => {
    const nextStatus: TaskStatus = task.status === 'done' ? 'todo' : 'done'
    await get().updateTask({ id: task.id, status: nextStatus })
  },

  moveTask: async (id, status, sortOrder) => {
    const workspaceId = get().activeWorkspaceId
    if (!workspaceId) return
    // Optimistic column move for a snappy drag.
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, status, sort_order: sortOrder } : t))
    }))
    await window.api.task.setStatus(id, status, sortOrder)
    const data = await reloadWorkspaceData(workspaceId)
    set({ tasks: data.tasks, goals: data.goals })
  },

  deleteTask: async (id) => {
    const workspaceId = get().activeWorkspaceId
    if (!workspaceId) return
    await window.api.task.remove(id)
    const data = await reloadWorkspaceData(workspaceId)
    set((s) => ({
      tasks: data.tasks,
      goals: data.goals,
      expandedTaskId: s.expandedTaskId === id ? null : s.expandedTaskId
    }))
  },

  createGoal: async (input) => {
    const workspaceId = get().activeWorkspaceId
    if (!workspaceId) return
    const trimmed = input.title.trim()
    if (!trimmed) return
    await window.api.goal.create({ ...input, title: trimmed, workspace_id: workspaceId })
    set({ goals: await window.api.goal.listByWorkspace(workspaceId) })
  },

  updateGoal: async (input) => {
    const workspaceId = get().activeWorkspaceId
    if (!workspaceId) return
    await window.api.goal.update(input)
    set({ goals: await window.api.goal.listByWorkspace(workspaceId) })
  },

  deleteGoal: async (id) => {
    const workspaceId = get().activeWorkspaceId
    if (!workspaceId) return
    await window.api.goal.remove(id)
    const data = await reloadWorkspaceData(workspaceId)
    set({ goals: data.goals, tasks: data.tasks })
  },

  toggleGoalDone: async (goal) => {
    const nextStatus: TaskStatus = goal.status === 'done' ? 'todo' : 'done'
    await get().updateGoal({ id: goal.id, status: nextStatus })
  },

  toggleExpand: (id) => set((s) => ({ expandedTaskId: s.expandedTaskId === id ? null : id })),
  collapse: () => set({ expandedTaskId: null }),
  focusTask: (task) =>
    set({ mainView: 'tasks', activeCategoryId: task.category_id, expandedTaskId: task.id }),
  openQuickCapture: () => set({ quickCaptureOpen: true }),
  closeQuickCapture: () => set({ quickCaptureOpen: false }),
  shiftMonth: (delta) =>
    set((s) => {
      const d = new Date(s.calYear, s.calMonth + delta, 1)
      return { calYear: d.getFullYear(), calMonth: d.getMonth() }
    }),
  goToToday: () => {
    const now = new Date()
    set({ calYear: now.getFullYear(), calMonth: now.getMonth() })
  }
}))
