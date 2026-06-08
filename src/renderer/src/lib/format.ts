import type { Priority } from '@shared/types'

export interface PriorityMeta {
  label: string
  // Tailwind text/bg/border classes for the badge.
  className: string
  dot: string
}

export const PRIORITY_META: Record<Priority, PriorityMeta> = {
  0: { label: '없음', className: 'text-muted-foreground bg-muted', dot: 'bg-muted-foreground/40' },
  1: { label: '낮음', className: 'text-sky-300 bg-sky-500/10', dot: 'bg-sky-400' },
  2: { label: '보통', className: 'text-amber-300 bg-amber-500/10', dot: 'bg-amber-400' },
  3: { label: '높음', className: 'text-rose-300 bg-rose-500/10', dot: 'bg-rose-400' }
}

export const STATUS_META: Record<
  'todo' | 'doing' | 'done',
  { label: string; className: string }
> = {
  todo: { label: '할 일', className: 'text-slate-300' },
  doing: { label: '진행 중', className: 'text-blue-300' },
  done: { label: '완료', className: 'text-emerald-300' }
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
