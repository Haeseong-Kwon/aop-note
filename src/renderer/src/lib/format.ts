import type { Priority, Recurrence, Task } from '@shared/types'

export const RECURRENCE_LABEL: Record<Recurrence, string> = {
  daily: '매일',
  weekdays: '평일마다',
  weekly: '매주',
  monthly: '매월'
}

export interface PriorityMeta {
  label: string
  // Tailwind text/bg/border classes for the badge.
  className: string
  dot: string
}

export const PRIORITY_META: Record<Priority, PriorityMeta> = {
  0: { label: '없음', className: 'text-muted-foreground bg-muted', dot: 'bg-muted-foreground/40' },
  1: { label: '낮음', className: 'text-sky-700 dark:text-sky-300 bg-sky-500/10', dot: 'bg-sky-400' },
  2: { label: '보통', className: 'text-amber-700 dark:text-amber-300 bg-amber-500/10', dot: 'bg-amber-400' },
  3: { label: '높음', className: 'text-rose-700 dark:text-rose-300 bg-rose-500/10', dot: 'bg-rose-400' }
}

export const STATUS_META: Record<
  'todo' | 'doing' | 'done',
  { label: string; className: string }
> = {
  todo: { label: '할 일', className: 'text-slate-600 dark:text-slate-300' },
  doing: { label: '진행 중', className: 'text-blue-700 dark:text-blue-300' },
  done: { label: '완료', className: 'text-emerald-700 dark:text-emerald-300' }
}

const startOfDay = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** Days until the due date relative to today. Negative = overdue. */
export function daysUntil(dueIso: string): number {
  const due = startOfDay(new Date(dueIso))
  const today = startOfDay(new Date())
  return Math.round((due - today) / (24 * 60 * 60 * 1000))
}

export interface DueMeta {
  label: string
  // 'overdue' | 'soon' (<=2d) | 'normal'
  tone: 'overdue' | 'soon' | 'normal'
}

export function formatDue(dueIso: string | null): DueMeta | null {
  if (!dueIso) return null
  const diff = daysUntil(dueIso)
  const date = new Date(dueIso)
  const md = `${date.getMonth() + 1}/${date.getDate()}`

  if (diff < 0) return { label: `${md} (${Math.abs(diff)}일 지남)`, tone: 'overdue' }
  if (diff === 0) return { label: '오늘', tone: 'soon' }
  if (diff === 1) return { label: '내일', tone: 'soon' }
  if (diff <= 2) return { label: `${md} (${diff}일 남음)`, tone: 'soon' }
  return { label: md, tone: 'normal' }
}

/** End of today (local), as an ISO timestamp. */
export function endOfTodayIso(): string {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate(), 23, 59, 59, 999).toISOString()
}

/** End of this week (local). Week ends Saturday to match the Sun-start calendar. */
export function endOfWeekIso(): string {
  const n = new Date()
  const daysToSat = 6 - n.getDay() // getDay: 0=Sun … 6=Sat
  const sat = new Date(n.getFullYear(), n.getMonth(), n.getDate() + daysToSat, 23, 59, 59, 999)
  return sat.toISOString()
}

/** Human-readable file size. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`
  const mb = kb / 1024
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`
}

/** Format a Date as a local YYYY-MM-DD string (timezone-safe, matches calendar bucketing). */
export function formatDateInput(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** ISO date (no time) for <input type="date"> binding — uses local components. */
export function toDateInput(iso: string | null): string {
  if (!iso) return ''
  return formatDateInput(new Date(iso))
}

/** Convert a date-input value back to a stored ISO timestamp (or null). */
export function fromDateInput(value: string): string | null {
  if (!value) return null
  return new Date(`${value}T00:00:00`).toISOString()
}

/** "방금", "5분 전", "3시간 전", then a plain "9월 21일" date. */
export function formatRelative(iso: string, now = new Date()): string {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return '방금'
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  const d = new Date(iso)
  return `${d.getMonth() + 1}월 ${d.getDate()}일`
}

export interface ChecklistProgress {
  done: number
  total: number
}

/** Count markdown checklist items in a memo — they act as the task's subtasks. */
export function checklistProgress(note: string): ChecklistProgress | null {
  const items = note.match(/^\s*[-*+] \[[ xX]\]/gm)
  if (!items) return null
  const done = items.filter((i) => /\[[xX]\]$/.test(i)).length
  return { done, total: items.length }
}

export type TaskSort = 'manual' | 'due' | 'priority'

// Missing due dates sort last.
const dueKey = (t: Task): number => (t.due_date ? new Date(t.due_date).getTime() : Infinity)
const byDue = (a: Task, b: Task): number => {
  const x = dueKey(a)
  const y = dueKey(b)
  return x === y ? 0 : x - y // Infinity - Infinity would be NaN
}
const byPriority = (a: Task, b: Task): number => b.priority - a.priority

/** Returns a new array; 'manual' keeps the drag order (sort_order). */
export function sortTasks(tasks: Task[], sort: TaskSort): Task[] {
  const chain = sort === 'due' ? [byDue, byPriority] : sort === 'priority' ? [byPriority, byDue] : []
  return [...tasks].sort((a, b) => {
    for (const cmp of chain) {
      const r = cmp(a, b)
      if (r !== 0) return r
    }
    return a.sort_order - b.sort_order
  })
}

/** ISO → local 'YYYY-MM-DDTHH:MM' for <input type="datetime-local">. */
export function toDateTimeInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${formatDateInput(d)}T${hh}:${mm}`
}

/** Local 'YYYY-MM-DDTHH:MM' → ISO (or null when cleared). */
export function fromDateTimeInput(value: string): string | null {
  return value ? new Date(value).toISOString() : null
}

/** "9/26 15:00" — compact reminder label. */
export function formatReminder(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${toDateTimeInput(iso).slice(11)}`
}

interface EventSpan {
  start: string
  end: string
  all_day: boolean
}

/** Local YYYY-MM-DD keys of every day an event covers (end exclusive). */
export function eventDayKeys(e: EventSpan): string[] {
  const start = new Date(e.start)
  // Exclusive end: an event ending exactly at midnight doesn't touch the next day.
  const last = new Date(Math.max(start.getTime(), new Date(e.end).getTime() - 1))
  const keys: string[] = []
  for (let d = new Date(start.getFullYear(), start.getMonth(), start.getDate()); d <= last; d.setDate(d.getDate() + 1)) {
    keys.push(formatDateInput(d))
  }
  return keys
}

const hhmm = (iso: string): string => {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** "09:05–10:30", or "종일" for all-day events. */
export function formatEventTime(e: EventSpan): string {
  return e.all_day ? '종일' : `${hhmm(e.start)}–${hhmm(e.end)}`
}
