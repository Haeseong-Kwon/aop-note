import { useMemo } from 'react'
import { CalendarCheck, Sun } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { TaskRow } from './TaskRow'
import { useTaskListKeyboard } from '@/hooks/useTaskListKeyboard'
import { daysUntil } from '@/lib/format'
import type { TaskWithContext } from '@shared/types'

export function SmartView(): JSX.Element {
  const smartView = useStore((s) => s.smartView)
  const smartTasks = useStore((s) => s.smartTasks)
  const focusTask = useStore((s) => s.focusTask)

  // Split into overdue (past due, not done) vs the rest, preserving server order.
  const { overdue, rest, ordered } = useMemo(() => {
    const od: TaskWithContext[] = []
    const rs: TaskWithContext[] = []
    for (const t of smartTasks) {
      if (t.status !== 'done' && t.due_date && daysUntil(t.due_date) < 0) od.push(t)
      else rs.push(t)
    }
    return { overdue: od, rest: rs, ordered: [...od, ...rs] }
  }, [smartTasks])

  useTaskListKeyboard(ordered, (t) => focusTask(t))

  const title = smartView === 'today' ? '오늘' : '이번 주'
  const Icon = smartView === 'today' ? Sun : CalendarCheck

  return (
    <div className="flex h-full flex-col">
      <div className="drag-region flex h-12 shrink-0 items-center gap-2 border-b border-border px-5">
        <Icon className="h-4 w-4 text-primary" />
        <h1 className="text-sm font-semibold tracking-tight">{title}</h1>
        <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">
          {ordered.length}
        </span>
      </div>

      {ordered.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 text-sm text-muted-foreground">
          <Icon className="mb-2 h-8 w-8 opacity-40" />
          <p>{title} 마감 작업이 없습니다. 🎉</p>
        </div>
      ) : (
        <div className="flex-1 space-y-1 overflow-y-auto p-3">
          {overdue.length > 0 && (
            <>
              <h2 className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-rose-400">
                지남 · {overdue.length}
              </h2>
              {overdue.map((t) => (
                <TaskRow key={t.id} task={t} mode="smart" />
              ))}
            </>
          )}

          {rest.length > 0 && (
            <>
              {overdue.length > 0 && (
                <h2 className="px-2 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  예정
                </h2>
              )}
              {rest.map((t) => (
                <TaskRow key={t.id} task={t} mode="smart" />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
