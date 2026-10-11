// Is a goal on schedule? Compares task completion with the share of time elapsed
// between the goal's creation and its due date.

export type GoalPace = 'done' | 'overdue' | 'behind' | 'on_track' | 'ahead'

interface PaceInput {
  status: string
  created_at: string
  due_date: string | null
  total_tasks: number
  progress: number
}

/** How far progress may trail elapsed time before a goal counts as behind. */
const BEHIND_MARGIN = 0.15
const AHEAD_MARGIN = 0.15

/** null when there is nothing to judge (no due date, or no linked tasks yet). */
export function goalPace(g: PaceInput, now = new Date()): GoalPace | null {
  if (g.status === 'done') return 'done'
  if (!g.due_date) return null
  const due = new Date(g.due_date).getTime()
  if (now.getTime() > due) return 'overdue'
  if (g.total_tasks === 0) return null
  const start = new Date(g.created_at).getTime()
  const elapsed = due > start ? Math.min(1, Math.max(0, (now.getTime() - start) / (due - start))) : 1
  if (g.progress + BEHIND_MARGIN < elapsed) return 'behind'
  if (g.progress > elapsed + AHEAD_MARGIN) return 'ahead'
  return 'on_track'
}

export const PACE_LABEL: Record<GoalPace, string> = {
  done: '달성',
  overdue: '기한 지남',
  behind: '일정보다 늦음',
  on_track: '순조로움',
  ahead: '앞서 감'
}
