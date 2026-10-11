import { useStore } from '@/store/useStore'
import { cn } from '@/lib/utils'
import { formatDue } from '@/lib/format'
import { goalPace, PACE_LABEL } from '@shared/goalPace'
import { ProgressRing } from './ProgressRing'
import type { GoalWithProgress } from '@shared/types'

function GoalPill({ goal, onOpen }: { goal: GoalWithProgress; onOpen: () => void }): JSX.Element {
  const done = goal.status === 'done'
  const pace = goalPace(goal)
  const due = formatDue(goal.due_date)
  const percent = Math.round(goal.progress * 100)
  return (
    <button
      onClick={onOpen}
      title={[goal.description, pace && PACE_LABEL[pace]].filter(Boolean).join(' · ') || goal.title}
      className="group flex shrink-0 items-center gap-2 rounded-full border border-border bg-background/60 py-1 pl-1.5 pr-3 text-left transition-[border-color,background-color] duration-base hover:border-desk/40 hover:bg-desk/[0.05]"
    >
      <ProgressRing value={done ? 1 : goal.progress} pace={pace} />
      <span className={cn('max-w-[14rem] truncate text-[13px] font-medium', done && 'text-muted-foreground line-through')}>
        {goal.title}
      </span>
      <span className="tabular text-[11px] text-muted-foreground">
        {goal.total_tasks > 0 ? `${percent}%` : '작업 없음'}
        {due && (
          <span className={cn('ml-1.5', due.tone === 'overdue' && !done && 'text-rose-600 dark:text-rose-400')}>{due.label}</span>
        )}
      </span>
    </button>
  )
}

/** The desk's goals as a slim row of progress pills above the task list. */
export function GoalStrip(): JSX.Element | null {
  const goals = useStore((s) => s.goals)
  const setMainView = useStore((s) => s.setMainView)

  if (goals.length === 0) return null

  return (
    <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-border px-5 py-2.5">
      {goals.map((goal) => (
        <GoalPill key={goal.id} goal={goal} onOpen={() => setMainView('goals')} />
      ))}
    </div>
  )
}
