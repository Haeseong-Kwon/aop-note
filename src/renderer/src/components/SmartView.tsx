import { useMemo } from 'react'
import { CalendarCheck, Sun } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { TaskRow } from './TaskRow'
import { PageHeader } from './PageHeader'
import { useTaskListKeyboard } from '@/hooks/useTaskListKeyboard'
import { daysUntil, endOfTodayIso, endOfWeekIso, formatEventTime } from '@/lib/format'
import { useCalendarEvents } from '@/hooks/useCalendarEvents'
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

  // Subscribed-calendar events in the same window: from now's day start to the view's end.
  const now = new Date()
  const { events } = useCalendarEvents(
    new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    new Date(smartView === 'today' ? endOfTodayIso() : endOfWeekIso())
  )
  const weekday = (iso: string): string => new Date(iso).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short' })

  const title = smartView === 'today' ? '오늘' : '이번 주'
  const Icon = smartView === 'today' ? Sun : CalendarCheck

  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={Icon} title={title} count={ordered.length} />

      {events.length > 0 && (
        <section aria-label="일정" className="shrink-0 border-b border-border px-3 pb-3 pt-2">
          <h2 className="px-2 pb-1 pt-1 text-xs font-medium text-muted-foreground">일정 · {events.length}</h2>
          <ul className="space-y-0.5">
            {events.map((e) => (
              <li
                key={e.id}
                title={`${e.calendar_name} (구독 캘린더, 읽기 전용)${e.description ? `\n${e.description}` : ''}`}
                className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm"
              >
                <span className="h-4 w-1 shrink-0 rounded-full" style={{ backgroundColor: e.color }} />
                {smartView === 'week' && <span className="w-16 shrink-0 text-xs text-muted-foreground">{weekday(e.start)}</span>}
                <span className="w-24 shrink-0 text-xs tabular-nums text-muted-foreground">{formatEventTime(e)}</span>
                <span className="min-w-0 flex-1 truncate">{e.title}</span>
                {e.location && <span className="max-w-[12rem] shrink-0 truncate text-xs text-muted-foreground">{e.location}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {ordered.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 text-sm text-muted-foreground">
          <Icon className="mb-2 h-8 w-8 opacity-40" />
          <p>{title} 마감 작업이 없습니다. 🎉</p>
        </div>
      ) : (
        <div className="flex-1 space-y-1 overflow-y-auto p-3">
          {overdue.length > 0 && (
            <>
              <h2 className="px-2 pb-1 pt-2 text-xs font-medium text-rose-600 dark:text-rose-400">
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
                <h2 className="px-2 pb-1 pt-3 text-xs font-medium text-muted-foreground">
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
