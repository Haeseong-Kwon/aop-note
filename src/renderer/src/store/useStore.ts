import { create } from 'zustand'
import { endOfTodayIso, endOfWeekIso, type TaskSort } from '@/lib/format'
import { useToast, toastError } from './useToast'
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
  UpdateWorkspaceInput,
  CreateGoalInput,
  UpdateGoalInput,
  TrashKind
} from '@shared/types'
import type { NavigatePayload } from '@shared/ipc'

export type ViewMode = 'list' | 'kanban'
export type MainView = 'tasks' | 'notes' | 'database' | 'calendar' | 'goals' | 'documents' | 'project'
export type SmartView = 'today' | 'week'
export type Theme = 'light' | 'dark' | 'system'
export type UtilityView = 'trash' | 'settings' | 'graph' | 'projects' | 'ask'

/** Enough to open a note from anywhere (graph, backlinks, links). */
export interface NoteRef {
  id: string
  workspace_id: string
  category_id: string
}

export interface ListPrefs {
  hideDone: boolean
  sort: TaskSort
}
const LIST_PREFS_KEY = 'aop-list-prefs'
const savedListPrefs = ((): ListPrefs => {
  const fallback: ListPrefs = { hideDone: false, sort: 'manual' }
  try {
    const raw = JSON.parse(localStorage.getItem(LIST_PREFS_KEY) ?? '{}') as Partial<ListPrefs>
    return {
      hideDone: typeof raw.hideDone === 'boolean' ? raw.hideDone : fallback.hideDone,
      sort: raw.sort === 'due' || raw.sort === 'priority' ? raw.sort : fallback.sort
    }
  } catch {
    return fallback // corrupt value: start from defaults
  }
})()

const undoToast = (message: string, undo: () => void): void =>
  useToast.getState().show({ message, actionLabel: '실행 취소', onAction: undo })

// ---- theme (applied immediately, persisted to localStorage) ----
function applyTheme(theme: Theme): void {
  const root = document.documentElement
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  root.classList.toggle('dark', dark)
  // Keep the native window backdrop on the same appearance as the UI; otherwise
  // the macOS vibrancy blur follows the OS and the glass tint sits on the wrong base.
  window.api?.setTheme(dark ? 'dark' : 'light')
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
  /** Trash / settings pages replace the desk area until a desk or smart view is picked. */
  utilityView: UtilityView | null
  /** Memo shown in the 메모 tab; null = its first note. */
  selectedNoteId: string | null
  /** Project document shown in the preview dialog. */
  openFile: { deskId: string; path: string } | null
  /** Bumped when a linked folder changes on disk, so project views reload. */
  projectVersion: number
  /** Bumped when subscribed calendars are re-fetched or changed. */
  calendarVersion: number
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
  sidebarCollapsed: boolean
  listPrefs: ListPrefs
  loading: boolean
  error: string | null

  // bootstrap & navigation
  init: () => Promise<void>
  refresh: () => Promise<void>
  selectWorkspace: (id: string) => Promise<void>
  selectCategory: (id: string | null) => void
  selectSmartView: (view: SmartView) => Promise<void>
  setMainView: (view: MainView) => void
  openUtility: (view: UtilityView) => void
  selectNote: (id: string | null) => void
  previewFile: (deskId: string, path: string) => void
  closeFile: () => void
  bumpProjectVersion: () => void
  bumpCalendarVersion: () => void
  /** Re-read the desk list (e.g. after a project folder was linked). */
  refreshWorkspaces: () => Promise<void>
  openNote: (note: NoteRef) => Promise<void>
  /** Follow a [[title]] from a memo: open it, or create it next to the source (Obsidian-style). */
  openLink: (title: string, from: Task) => Promise<void>
  /** Notion's Duplicate: copy content + formatting + page settings, then open the copy. */
  duplicateNote: (task: Task) => Promise<void>
  restoreFromTrash: (kind: TrashKind, id: string) => Promise<void>
  setView: (view: ViewMode) => void
  navigateToTask: (payload: NavigatePayload) => Promise<void>

  // workspace / category
  createWorkspace: (name: string) => Promise<void>
  renameWorkspace: (id: string, name: string) => Promise<void>
  updateWorkspace: (input: UpdateWorkspaceInput) => Promise<void>
  reorderWorkspaces: (updates: UpdateWorkspaceInput[]) => Promise<void>
  deleteWorkspace: (id: string) => Promise<void>
  createCategory: (input: Omit<CreateCategoryInput, 'workspace_id'>) => Promise<void>
  updateCategory: (input: UpdateCategoryInput) => Promise<void>
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
  toggleSidebar: () => void
  setListPrefs: (prefs: Partial<ListPrefs>) => void
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
  utilityView: null,
  selectedNoteId: null,
  openFile: null,
  projectVersion: 0,
  calendarVersion: 0,
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
  sidebarCollapsed: localStorage.getItem('aop-sidebar-collapsed') === '1',
  listPrefs: savedListPrefs,
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
      utilityView: null,
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
    set({ smartView: view, utilityView: null, smartTasks, expandedTaskId: null, selectedTaskId: null })
  },

  setMainView: (mainView) => set({ mainView, expandedTaskId: null, selectedTaskId: null }),
  openUtility: (utilityView) => set({ utilityView, expandedTaskId: null, selectedTaskId: null }),
  selectNote: (selectedNoteId) => set({ selectedNoteId }),
  previewFile: (deskId, path) => set({ openFile: { deskId, path } }),
  closeFile: () => set({ openFile: null }),
  bumpProjectVersion: () => set((s) => ({ projectVersion: s.projectVersion + 1 })),
  bumpCalendarVersion: () => set((s) => ({ calendarVersion: s.calendarVersion + 1 })),
  refreshWorkspaces: async () => set({ workspaces: await window.api.workspace.list() }),

  openNote: async (note) => {
    if (get().activeWorkspaceId !== note.workspace_id || get().smartView) {
      await get().selectWorkspace(note.workspace_id)
    }
    set({
      utilityView: null,
      smartView: null,
      mainView: 'notes',
      activeCategoryId: note.category_id,
      selectedNoteId: note.id
    })
  },

  duplicateNote: async (task) => {
    try {
      const copy = await window.api.task.duplicate(task.id)
      await get().refresh()
      const workspaceId = get().activeWorkspaceId
      if (workspaceId) await get().openNote({ id: copy.id, workspace_id: workspaceId, category_id: copy.category_id })
      useToast.getState().show({ message: `'${copy.title}'을(를) 만들었습니다.` })
    } catch (e) {
      toastError(e)
    }
  },

  openLink: async (title, from) => {
    try {
      const hit = await window.api.link.resolve(title, from.id)
      if (hit) return get().openNote(hit)
      const created = await window.api.task.create({ category_id: from.category_id, title })
      const workspaceId = get().activeWorkspaceId
      if (!workspaceId) return
      await get().openNote({ id: created.id, workspace_id: workspaceId, category_id: from.category_id })
      await get().refresh()
      useToast.getState().show({ message: `'${title}' 메모를 새로 만들었습니다.` })
    } catch (e) {
      toastError(e)
    }
  },

  restoreFromTrash: async (kind, id) => {
    try {
      await window.api.trash.restore(kind, id)
      const workspaces = await window.api.workspace.list()
      set({ workspaces })
      const { activeWorkspaceId } = get()
      if (kind === 'workspace' && get().utilityView === null) await get().selectWorkspace(id)
      else if (!activeWorkspaceId && workspaces[0]) await get().selectWorkspace(workspaces[0].id)
      else await get().refresh()
      useToast.getState().show({ message: '복원했습니다.' })
    } catch (e) {
      toastError(e)
    }
  },
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

  renameWorkspace: async (id, name) => {
    const trimmed = name.trim()
    if (!trimmed) return
    await window.api.workspace.update({ id, name: trimmed })
    set({ workspaces: await window.api.workspace.list() })
  },

  updateWorkspace: async (input) => {
    // optimistic style change (color/icon) so the picker feels instant
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === input.id
          ? {
              ...w,
              color: input.color ?? w.color,
              icon: input.icon ?? w.icon,
              name: input.name ?? w.name
            }
          : w
      )
    }))
    await window.api.workspace.update(input)
    set({ workspaces: await window.api.workspace.list() })
  },

  reorderWorkspaces: async (updates) => {
    set((s) => ({
      workspaces: [...s.workspaces]
        .map((w) => {
          const u = updates.find((x) => x.id === w.id)
          return u && u.sort_order !== undefined ? { ...w, sort_order: u.sort_order } : w
        })
        .sort((a, b) => a.sort_order - b.sort_order)
    }))
    await window.api.workspace.reorder(updates)
    set({ workspaces: await window.api.workspace.list() })
  },

  deleteWorkspace: async (id) => {
    const name = get().workspaces.find((w) => w.id === id)?.name ?? '데스크'
    await window.api.workspace.remove(id)
    undoToast(`'${name}' 데스크를 휴지통으로 옮겼습니다.`, () => get().restoreFromTrash('workspace', id))
    const workspaces = await window.api.workspace.list()
    set({ workspaces })
    const { activeWorkspaceId, smartView } = get()
    if (activeWorkspaceId === id) {
      if (workspaces.length > 0) {
        await get().selectWorkspace(workspaces[0].id)
      } else {
        set({
          activeWorkspaceId: null,
          categories: [],
          tasks: [],
          goals: [],
          activeCategoryId: null,
          expandedTaskId: null,
          selectedTaskId: null
        })
      }
    } else if (smartView) {
      await get().refresh()
    }
  },

  createCategory: async (input) => {
    const workspaceId = get().activeWorkspaceId
    if (!workspaceId) return
    const trimmed = input.name.trim()
    if (!trimmed) return
    await window.api.category.create({ ...input, name: trimmed, workspace_id: workspaceId })
    await get().refresh()
  },

  updateCategory: async (input) => {
    set((s) => ({
      categories: s.categories.map((c) =>
        c.id === input.id
          ? { ...c, color: input.color ?? c.color, name: input.name ?? c.name }
          : c
      )
    }))
    await window.api.category.update(input)
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
    undoToast('카테고리를 휴지통으로 옮겼습니다.', () => get().restoreFromTrash('category', id))
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
    const completing = task.status !== 'done'
    await get().updateTask({ id: task.id, status: completing ? 'done' : 'todo' })
    // Main scheduled the next occurrence; say so, since it appears without being asked for.
    if (completing && task.recurrence) useToast.getState().show({ message: '반복 작업의 다음 일정을 추가했습니다.' })
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
    undoToast('작업을 휴지통으로 옮겼습니다.', () => get().restoreFromTrash('task', id))
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
  },
  toggleSidebar: () =>
    set((s) => {
      const sidebarCollapsed = !s.sidebarCollapsed
      localStorage.setItem('aop-sidebar-collapsed', sidebarCollapsed ? '1' : '0')
      return { sidebarCollapsed }
    }),
  setListPrefs: (prefs) =>
    set((s) => {
      const listPrefs = { ...s.listPrefs, ...prefs }
      localStorage.setItem(LIST_PREFS_KEY, JSON.stringify(listPrefs))
      return { listPrefs }
    })
}))

// Keep "system" theme in sync with OS changes.
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (useStore.getState().theme === 'system') applyTheme('system')
})
