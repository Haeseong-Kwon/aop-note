import type { Recurrence } from '@shared/types'

const addDays = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

function step(d: Date, rule: Recurrence): Date {
  switch (rule) {
    case 'daily':
      return addDays(d, 1)
    case 'weekdays': {
      let n = addDays(d, 1)
      while (n.getDay() === 0 || n.getDay() === 6) n = addDays(n, 1)
      return n
    }
    case 'weekly':
      return addDays(d, 7)
    case 'monthly': {
      // Same day next month, clamped to that month's length (Jan 31 → Feb 28).
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 2, 0).getDate()
      return new Date(d.getFullYear(), d.getMonth() + 1, Math.min(d.getDate(), lastDay))
    }
  }
}

/**
 * The next due date after `due` for a repeat rule. A task completed late skips the
 * occurrences it missed rather than scheduling one that is already overdue.
 */
export function nextOccurrence(due: Date, rule: Recurrence, today: Date): Date {
  const floor = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  let next = step(due, rule)
  while (next < floor) next = step(next, rule)
  return next
}

/** Untick every markdown checklist item so a routine's checklist starts fresh. */
export const resetChecklist = (note: string): string => note.replace(/^(\s*[-*+] )\[[xX]\]/gm, '$1[ ]')
