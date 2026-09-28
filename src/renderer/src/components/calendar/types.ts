/** Anything the calendar draws: an app 일정, a subscribed-calendar event, or a task due date. */
export interface CalItem {
  id: string
  kind: 'schedule' | 'event' | 'task'
  title: string
  color: string
  /** 'YYYY-MM-DD', inclusive. */
  startDay: string
  endDay: string
  /** "14:00" for timed items, '' for all-day. */
  time: string
  done?: boolean
  /** Opens / edits it. */
  open: () => void
}

export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

/** '2026-10-01' → '10/1 (목)' */
export function shortDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return `${m}/${d} (${WEEKDAYS[new Date(y, m - 1, d).getDay()]})`
}

/** '10/1 (목)' or '10/1 (목) ~ 10/3 (토)' */
export const dayRange = (a: string, b: string): string => (a === b ? shortDay(a) : `${shortDay(a)} ~ ${shortDay(b)}`)
