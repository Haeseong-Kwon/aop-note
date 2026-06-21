import { useState } from 'react'
import { Check, Plus, Trash2, Target, ChevronRight } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Button } from '@/components/ui/button'
import { DueBadge } from './TaskBadges'
import { toDateInput, fromDateInput } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { GoalWithProgress } from '@shared/types'

function GoalCard({ goal }: { goal: GoalWithProgress }): JSX.Element {
  const updateGoal = useStore((s) => s.updateGoal)
  const deleteGoal = useStore((s) => s.deleteGoal)
  const toggleGoalDone = useStore((s) => s.toggleGoalDone)

  const [expanded, setExpanded] = useState(false)
  const [title, setTitle] = useState(goal.title)
  const [description, setDescription] = useState(goal.description)

  const done = goal.status === 'done'

  const commitTitle = (): void => {
    const next = title.trim()
    if (next && next !== goal.title) updateGoal({ id: goal.id, title: next })
    else setTitle(goal.title)
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-start gap-3 p-4">
        <button
          onClick={() => toggleGoalDone(goal)}
          className={cn(
            'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors',
            done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-input hover:border-primary'
          )}
          title={done ? '진행 중으로' : '목표 완료'}
        >
          {done && <Check className="h-3.5 w-3.5" />}
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
              작업 {goal.done_tasks}/{goal.total_tasks} 완료
            </span>
            <DueBadge due={goal.due_date} />
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
