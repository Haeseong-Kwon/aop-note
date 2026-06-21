import { Check, Target } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { cn } from '@/lib/utils'
import { DueBadge } from './TaskBadges'
import type { GoalWithProgress } from '@shared/types'

function GoalChip({ goal, onOpen }: { goal: GoalWithProgress; onOpen: () => void }): JSX.Element {
  const done = goal.status === 'done'

  return (
    <button
      onClick={onOpen}
      title={goal.description || goal.title}
      className={cn(
        'group relative flex w-60 shrink-0 flex-col gap-1.5 overflow-hidden rounded-xl border px-3.5 py-3 text-left',
        'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
        done
          ? 'border-emerald-500/30 bg-emerald-500/[0.06] hover:border-emerald-500/50'
          : 'border-border bg-card hover:border-primary/50'
      )}
    >
      {/* 좌측 강조 바 */}
      <span
        className={cn(
          'absolute inset-y-0 left-0 w-1 transition-colors',
          done ? 'bg-emerald-500' : 'bg-primary/70 group-hover:bg-primary'
        )}
      />

      <div className="flex items-center gap-2 pl-1">
        <span
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-lg',
            done ? 'bg-emerald-500/15 text-emerald-500' : 'bg-primary/10 text-primary'
          )}
        >
          {done ? <Check className="h-3.5 w-3.5" /> : <Target className="h-3.5 w-3.5" />}
        </span>
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-sm font-semibold leading-tight',
            done && 'line-through opacity-60'
          )}
        >
          {goal.title}
        </span>
      </div>

      {goal.description && (
        <p className="line-clamp-2 pl-1 text-xs leading-snug text-muted-foreground">
          {goal.description}
        </p>
      )}

      <div className="flex items-center gap-2 pl-1 text-[11px] text-muted-foreground">
        <span className="tabular-nums">
          작업 {goal.done_tasks}/{goal.total_tasks}
        </span>
        {goal.due_date && (
          <>
            <span className="text-border">·</span>
            <DueBadge due={goal.due_date} />
          </>
        )}
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
    <div className="flex shrink-0 gap-2.5 overflow-x-auto border-b border-border bg-muted/20 px-5 py-3">
      {goals.map((goal) => (
        <GoalChip key={goal.id} goal={goal} onOpen={() => setMainView('goals')} />
      ))}
    </div>
  )
}
