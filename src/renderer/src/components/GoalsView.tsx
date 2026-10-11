import { useState } from 'react'
import { Check, Plus, Trash2, Target, ChevronRight, X } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Button } from '@/components/ui/button'
import { DueBadge } from './TaskBadges'
import { toDateInput, fromDateInput } from '@/lib/format'
import { cn } from '@/lib/utils'
import { goalPace, PACE_LABEL, type GoalPace } from '@shared/goalPace'
import { ProgressRing } from './ProgressRing'
import type { GoalWithProgress } from '@shared/types'

const PACE_STYLE: Record<GoalPace, string> = {
  done: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  ahead: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  on_track: 'bg-muted text-muted-foreground',
  behind: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  overdue: 'bg-destructive/15 text-destructive'
}

/** Tasks linked to the goal, with a picker to link more from this desk. */
function GoalTasks({ goalId }: { goalId: string }): JSX.Element {
  const tasks = useStore((s) => s.tasks)
  const workspaceId = useStore((s) => s.activeWorkspaceId)
  const updateTask = useStore((s) => s.updateTask)
  const toggleDone = useStore((s) => s.toggleDone)
  const openNote = useStore((s) => s.openNote)
  const linked = tasks.filter((t) => t.goal_id === goalId)
  const linkable = tasks.filter((t) => t.goal_id !== goalId && t.status !== 'done')

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">연결된 작업</label>
      {linked.length === 0 && <p className="text-xs text-muted-foreground">아직 없습니다. 아래에서 이 데스크의 작업을 연결하세요.</p>}
      <ul className="space-y-0.5">
        {linked.map((t) => (
          <li key={t.id} className="group flex items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-accent/60">
            <button
              onClick={() => void toggleDone(t)}
              aria-label={t.status === 'done' ? '완료 취소' : '완료'}
              className={cn(
                'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                t.status === 'done' ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-input hover:border-primary'
              )}
            >
              {t.status === 'done' && <Check className="h-3 w-3" />}
            </button>
            <button
              onClick={() => workspaceId && void openNote({ id: t.id, workspace_id: workspaceId, category_id: t.category_id })}
              className={cn('min-w-0 flex-1 truncate text-left', t.status === 'done' && 'text-muted-foreground line-through')}
            >
              {t.title}
            </button>
            <button
              onClick={() => void updateTask({ id: t.id, goal_id: null })}
              title="연결 해제"
              aria-label={`'${t.title}' 연결 해제`}
              className="text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 group-has-[:focus-visible]:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
      {linkable.length > 0 && (
        <select
          value=""
          aria-label="작업 연결"
          onChange={(e) => e.target.value && void updateTask({ id: e.target.value, goal_id: goalId })}
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">+ 작업 연결…</option>
          {linkable.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

function GoalCard({ goal }: { goal: GoalWithProgress }): JSX.Element {
  const updateGoal = useStore((s) => s.updateGoal)
  const deleteGoal = useStore((s) => s.deleteGoal)
  const toggleGoalDone = useStore((s) => s.toggleGoalDone)

  const [expanded, setExpanded] = useState(false)
  const [title, setTitle] = useState(goal.title)
  const [description, setDescription] = useState(goal.description)

  const done = goal.status === 'done'
  const pace = goalPace(goal)
  const percent = Math.round(goal.progress * 100)

  const commitTitle = (): void => {
    const next = title.trim()
    if (next && next !== goal.title) updateGoal({ id: goal.id, title: next })
    else setTitle(goal.title)
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card transition-shadow duration-base hover:shadow-sm">
      <div className="flex items-start gap-3 p-4">
        <button
          onClick={() => toggleGoalDone(goal)}
          className="group/ring relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          title={done ? '진행 중으로' : '목표 완료'}
          aria-label={done ? `'${goal.title}' 진행 중으로` : `'${goal.title}' 목표 완료`}
        >
          <ProgressRing value={done ? 1 : goal.progress} pace={pace} size={36} />
          <span className={cn('tabular absolute text-[10px] font-semibold', done ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground/80')}>
            {done ? <Check className="h-4 w-4" /> : goal.total_tasks > 0 ? `${percent}` : '–'}
          </span>
        </button>

        <div className="min-w-0 flex-1">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full items-center gap-2 text-left"
          >
            <span className={cn('truncate text-sm font-medium', done && 'line-through opacity-60')}>
              {goal.title}
            </span>
            <ChevronRight
              className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-90')}
            />
          </button>

          {goal.description && !expanded && (
            <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {goal.description}
            </p>
          )}

          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="tabular-nums">
              작업 {goal.done_tasks}/{goal.total_tasks} 완료{goal.total_tasks > 0 && ` · ${percent}%`}
            </span>
            <DueBadge due={goal.due_date} />
            {pace && pace !== 'done' && <span className={cn('rounded-full px-1.5 py-0.5 text-[11px] font-medium', PACE_STYLE[pace])}>{PACE_LABEL[pace]}</span>}
          </div>
        </div>

        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={() => deleteGoal(goal.id)}
          title="목표 삭제"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {expanded && (
        <div className="space-y-3 border-t border-border bg-muted/20 p-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-ring"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => description !== goal.description && updateGoal({ id: goal.id, description })}
            rows={3}
            placeholder="목표 설명"
            className="w-full resize-y rounded-md border border-input bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">목표 기한</label>
            <input
              type="date"
              value={toDateInput(goal.due_date)}
              onChange={(e) => updateGoal({ id: goal.id, due_date: fromDateInput(e.target.value) })}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <GoalTasks goalId={goal.id} />
        </div>
      )}
    </div>
  )
}

export function GoalsView(): JSX.Element {
  const goals = useStore((s) => s.goals)
  const createGoal = useStore((s) => s.createGoal)

  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')

  const submit = async (): Promise<void> => {
    await createGoal({ title })
    setTitle('')
    setAdding(false)
  }

  return (
    <div className="mx-auto h-full w-full max-w-2xl overflow-y-auto p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Target className="h-5 w-5 text-primary" />
          목표
        </h2>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" />새 목표
        </Button>
      </div>

      {adding && (
        <input
          autoFocus
          value={title}
          placeholder="목표 제목 (Enter로 추가)"
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => setAdding(false)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return // 한글 IME 조합 Enter 무시
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') {
              setAdding(false)
              setTitle('')
            }
          }}
          className="mb-3 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      )}

      <div className="space-y-2.5">
        {goals.map((g) => (
          <GoalCard key={g.id} goal={g} />
        ))}
      </div>

      {goals.length === 0 && !adding && (
        <div className="flex flex-col items-center gap-1 py-16 text-sm text-muted-foreground">
          <Target className="mb-2 h-8 w-8 opacity-40" />
          <p>아직 목표가 없습니다.</p>
          <p>데스크의 목표를 만들고 작업을 연결해 진행률을 추적하세요.</p>
        </div>
      )}
    </div>
  )
}
