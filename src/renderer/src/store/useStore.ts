import { create } from 'zustand'
import { endOfTodayIso, endOfWeekIso } from '@/lib/format'
import type {
  Workspace,
  Category,
  Task,
  TaskWithContext,
  GoalWithProgress,
  TaskStatus,
  Priority,
  CreateTaskInput,
  UpdateTaskInput,
  UpdateCategoryInput,
  CreateCategoryInput,
  CreateGoalInput,
  UpdateGoalInput
} from '@shared/types'
import type { NavigatePayload } from '@shared/ipc'

export type ViewMode = 'list' | 'kanban'
export type MainView = 'tasks' | 'calendar' | 'goals'
export type SmartView = 'today' | 'week'
export type Theme = 'light' | 'dark' | 'system'

// ---- theme (applied immediately, persisted to localStorage) ----
function applyTheme(theme: Theme): void {
  const root = document.documentElement
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  root.classList.toggle('dark', dark)
}
const savedTheme = ((): Theme => {
  const t = localStorage.getItem('aop-theme')
  return t === 'light' || t === 'dark' || t === 'system' ? t : 'system'
})()
applyTheme(savedTheme)

interface AppState {
  // data
  workspaces: Workspace[]
  categories: Category[]
  tasks: Task[] // active workspace tasks
  goals: GoalWithProgress[]
  smartTasks: TaskWithContext[] // cross-workspace, for smart views

  // navigation / selection
  activeWorkspaceId: string | null
  activeCategoryId: string | null
  smartView: SmartView | null
  mainView: MainView
  view: ViewMode
  selectedTaskId: string | null
  expandedTaskId: string | null
  editingTitleId: string | null

  // overlays
  quickCaptureOpen: boolean
  quickCaptureDate: string | null // preset due date (YYYY-MM-DD) when opened from the calendar
  paletteOpen: boolean
  helpOpen: boolean

  // calendar nav + misc
  calYear: number
  calMonth: number
  theme: Theme
  loading: boolean
  error: string | null

  // bootstrap & navigation
  init: () => Promise<void>
  refresh: () => Promise<void>
  selectWorkspace: (id: string) => Promise<void>
  selectCategory: (id: string | null) => void
  selectSmartView: (view: SmartView) => Promise<void>
  setMainView: (view: MainView) => void
  setView: (view: ViewMode) => void
  navigateToTask: (payload: NavigatePayload) => Promise<void>

  // workspace / category
  createWorkspace: (name: string) => Promise<void>
  createCategory: (input: Omit<CreateCategoryInput, 'workspace_id'>) => Promise<void>
  reorderCategories: (updates: UpdateCategoryInput[]) => Promise<void>
  deleteCategory: (id: string) => Promise<void>

  // tasks
  createTask: (input: CreateTaskInput) => Promise<Task | null>
  updateTask: (input: UpdateTaskInput) => Promise<void>
  setPriority: (id: string, priority: Priority) => Promise<void>
  toggleDone: (task: Task) => Promise<void>
  moveTask: (id: string, status: TaskStatus, sortOrder: number) => Promise<void>
  reorderTasks: (updates: UpdateTaskInput[]) => Promise<void>
  deleteTask: (id: string) => Promise<void>

  // goals
  createGoal: (input: Omit<CreateGoalInput, 'workspace_id'>) => Promise<void>
  updateGoal: (input: UpdateGoalInput) => Promise<void>
  deleteGoal: (id: string) => Promise<void>
  toggleGoalDone: (goal: GoalWithProgress) => Promise<void>

  // selection / inline edit
  setSelectedTask: (id: string | null) => void
  toggleExpand: (id: string) => void
  collapse: () => void
  setEditingTitle: (id: string | null) => void
  focusTask: (task: Task) => void

  // overlays + calendar + theme
  openQuickCapture: (date?: string) => void
  closeQuickCapture: () => void
  openPalette: () => void
  closePalette: () => void
  toggleHelp: () => void
  closeHelp: () => void
  shiftMonth: (delta: number) => void
  goToToday: () => void
  setTheme: (theme: Theme) => void
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

const loadSmart = (view: SmartView): Promise<TaskWithContext[]> =>
  window.api.task.listUpcoming(view === 'today' ? endOfTodayIso() : endOfWeekIso())

const now = new Date()

export const useStore = create<AppState>((set, get) => ({
  workspaces: [],
  categories: [],
  tasks: [],
  goals: [],
  smartTasks: [],
  activeWorkspaceId: null,
  activeCategoryId: null,
  smartView: null,
  mainView: 'tasks',
  view: 'list',
  selectedTaskId: null,
  expandedTaskId: null,
  editingTitleId: null,
  quickCaptureOpen: false,
  quickCaptureDate: null,
  paletteOpen: false,
  helpOpen: false,
  calYear: now.getFullYear(),
  calMonth: now.getMonth(),
  theme: savedTheme,
  loading: true,
  error: null,

  init: async () => {
    try {
      set({ loading: true, error: null })
      const workspaces = await window.api.workspace.list()
      set({ workspaces })
      if (workspaces.length > 0) await get().selectWorkspace(workspaces[0].id)
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    } finally {
      set({ loading: false })
    }
  },

  // Reload whatever views are currently active (workspace data and/or smart view).
  refresh: async () => {
    const { activeWorkspaceId, smartView } = get()
    const jobs: Promise<void>[] = []
    if (activeWorkspaceId) {
      jobs.push(
        reloadWorkspaceData(activeWorkspaceId).then((d) =>
          set({ categories: d.categories, tasks: d.tasks, goals: d.goals })
        )
      )
    }
    if (smartView) jobs.push(loadSmart(smartView).then((smartTasks) => set({ smartTasks })))
    await Promise.all(jobs)
  },

  selectWorkspace: async (id) => {
    const { categories, tasks, goals } = await reloadWorkspaceData(id)
    set({
      activeWorkspaceId: id,
      smartView: null,
      categories,
      tasks,
      goals,
      activeCategoryId: categories[0]?.id ?? null,
      expandedTaskId: null,
      selectedTaskId: null
    })
  },

  selectCategory: (id) => set({ activeCategoryId: id, expandedTaskId: null, selectedTaskId: null }),

  selectSmartView: async (view) => {
    const smartTasks = await loadSmart(view)
    set({ smartView: view, smartTasks, expandedTaskId: null, selectedTaskId: null })
  },

  setMainView: (mainView) => set({ mainView, expandedTaskId: null, selectedTaskId: null }),
  setView: (view) => set({ view, expandedTaskId: null, selectedTaskId: null }),

  navigateToTask: async (payload) => {
    set({ paletteOpen: false })
    await get().selectWorkspace(payload.workspace_id)
    set({
      mainView: 'tasks',
      view: 'list',
      activeCategoryId: payload.category_id,
      expandedTaskId: payload.task_id,
      selectedTaskId: payload.task_id
    })
  },

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
    await get().refresh()
  },

  reorderCategories: async (updates) => {
    // optimistic
    set((s) => ({
      categories: s.categories.map((c) => {
        const u = updates.find((x) => x.id === c.id)
        return u && u.sort_order !== undefined ? { ...c, sort_order: u.sort_order } : c
      })
    }))
    await window.api.category.reorder(updates)
    await get().refresh()
  },

  deleteCategory: async (id) => {
    await window.api.category.remove(id)
    await get().refresh()
    set((s) => ({
      activeCategoryId:
        s.activeCategoryId === id ? (s.categories[0]?.id ?? null) : s.activeCategoryId
    }))
  },

  createTask: async (input) => {
    const task = await window.api.task.create(input)
    await get().refresh()
    return task
  },

  updateTask: async (input) => {
    await window.api.task.update(input)
    await get().refresh()
  },

  setPriority: async (id, priority) => {
    await get().updateTask({ id, priority })
  },

  toggleDone: async (task) => {
    await get().updateTask({ id: task.id, status: task.status === 'done' ? 'todo' : 'done' })
  },

  moveTask: async (id, status, sortOrder) => {
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, status, sort_order: sortOrder } : t))
    }))
    await window.api.task.setStatus(id, status, sortOrder)
    await get().refresh()
  },

  reorderTasks: async (updates) => {
    // optimistic: apply new sort_order/status locally so the list doesn't flicker
    const apply = <T extends Task>(t: T): T => {
      const u = updates.find((x) => x.id === t.id)
      if (!u) return t
      return {
        ...t,
        sort_order: u.sort_order ?? t.sort_order,
        status: u.status ?? t.status
      }
    }
    set((s) => ({ tasks: s.tasks.map(apply), smartTasks: s.smartTasks.map(apply) }))
    await window.api.task.reorder(updates)
    await get().refresh()
  },

  deleteTask: async (id) => {
    await window.api.task.remove(id)
    await get().refresh()
    set((s) => ({
      expandedTaskId: s.expandedTaskId === id ? null : s.expandedTaskId,
      selectedTaskId: s.selectedTaskId === id ? null : s.selectedTaskId
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
    await window.api.goal.remove(id)
    await get().refresh()
  },

  toggleGoalDone: async (goal) => {
    await get().updateGoal({ id: goal.id, status: goal.status === 'done' ? 'todo' : 'done' })
  },

  setSelectedTask: (id) => set({ selectedTaskId: id }),
  toggleExpand: (id) =>
    set((s) => ({
      expandedTaskId: s.expandedTaskId === id ? null : id,
      selectedTaskId: id
    })),
  collapse: () => set({ expandedTaskId: null, editingTitleId: null }),
  setEditingTitle: (id) => set({ editingTitleId: id }),
  focusTask: (task) =>
    set({
      smartView: null,
      mainView: 'tasks',
      activeCategoryId: task.category_id,
      expandedTaskId: task.id,
      selectedTaskId: task.id
    }),

  openQuickCapture: (date) => set({ quickCaptureOpen: true, quickCaptureDate: date ?? null }),
  closeQuickCapture: () => set({ quickCaptureOpen: false, quickCaptureDate: null }),
  openPalette: () => set({ paletteOpen: true }),
  closePalette: () => set({ paletteOpen: false }),
  toggleHelp: () => set((s) => ({ helpOpen: !s.helpOpen })),
  closeHelp: () => set({ helpOpen: false }),
  shiftMonth: (delta) =>
    set((s) => {
      const d = new Date(s.calYear, s.calMonth + delta, 1)
      return { calYear: d.getFullYear(), calMonth: d.getMonth() }
    }),
  goToToday: () => {
    const n = new Date()
    set({ calYear: n.getFullYear(), calMonth: n.getMonth() })
  },
  setTheme: (theme) => {
    localStorage.setItem('aop-theme', theme)
    applyTheme(theme)
    set({ theme })
  }
}))

// Keep "system" theme in sync with OS changes.
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (useStore.getState().theme === 'system') applyTheme('system')
})
