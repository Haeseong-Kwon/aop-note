import { Check, Target } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { cn } from '@/lib/utils'
import type { GoalWithProgress } from '@shared/types'

function GoalChip({ goal, onOpen }: { goal: GoalWithProgress; onOpen: () => void }): JSX.Element {
  const done = goal.status === 'done'
  const pct = Math.round(goal.progress * 100)

  return (
    <button
      onClick={onOpen}
      title={`${goal.title} · ${goal.done_tasks}/${goal.total_tasks} 완료`}
      className="flex w-56 shrink-0 flex-col gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-primary/60 hover:bg-accent/40"
    >
      <div className="flex items-center gap-2">
        {done ? (
          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
        ) : (
          <Target className="h-3.5 w-3.5 shrink-0 text-primary" />
        )}
        <span className={cn('min-w-0 flex-1 truncate text-xs font-medium', done && 'line-through opacity-60')}>
          {goal.title}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all', done ? 'bg-emerald-500' : 'bg-primary')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </button>
  )
}

/** Strip of compact desk-goal cards shown at the top of the work window. */
export function GoalStrip(): JSX.Element | null {
  const goals = useStore((s) => s.goals)
  const setMainView = useStore((s) => s.setMainView)

  if (goals.length === 0) return null

  return (
    <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-border px-5 py-3">
      {goals.map((goal) => (
        <GoalChip key={goal.id} goal={goal} onOpen={() => setMainView('goals')} />
      ))}
    </div>
  )
}
