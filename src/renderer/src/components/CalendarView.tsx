import { useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Button } from '@/components/ui/button'
import { PRIORITY_META } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Task } from '@shared/types'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

const dayKey = (y: number, m: number, d: number): string => `${y}-${m}-${d}`
const keyOfIso = (iso: string): string => {
  const d = new Date(iso)
  return dayKey(d.getFullYear(), d.getMonth(), d.getDate())
}

export function CalendarView(): JSX.Element {
  const tasks = useStore((s) => s.tasks)
  const calYear = useStore((s) => s.calYear)
  const calMonth = useStore((s) => s.calMonth)
  const shiftMonth = useStore((s) => s.shiftMonth)
  const goToToday = useStore((s) => s.goToToday)
  const focusTask = useStore((s) => s.focusTask)

  // Bucket tasks (with a due date) by local day.
  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>()
    tasks.forEach((t) => {
      if (!t.due_date) return
      const k = keyOfIso(t.due_date)
      const list = map.get(k) ?? []
      list.push(t)
      map.set(k, list)
    })
    return map
  }, [tasks])

  // 6-week grid starting from the Sunday on/just before the 1st.
  const cells = useMemo(() => {
    const first = new Date(calYear, calMonth, 1)
    const start = new Date(calYear, calMonth, 1 - first.getDay())
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
      return d
    })
  }, [calYear, calMonth])

  const now = new Date()
  const todayKey = dayKey(now.getFullYear(), now.getMonth(), now.getDate())

  return (
    <div className="flex h-full flex-col p-5">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          {calYear}년 {calMonth + 1}월
        </h2>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => shiftMonth(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => shiftMonth(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button size="sm" variant="outline" onClick={goToToday}>
          오늘
        </Button>
      </div>

      <div className="grid grid-cols-7 border-b border-border pb-1">
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            className={cn(
              'px-2 text-xs font-medium text-muted-foreground',
              i === 0 && 'text-rose-400/80',
              i === 6 && 'text-sky-400/80'
            )}
          >
            {w}
          </div>
        ))}
      </div>

      <div className="grid flex-1 grid-cols-7 grid-rows-6 gap-px overflow-hidden rounded-b-lg bg-border">
        {cells.map((d, i) => {
          const inMonth = d.getMonth() === calMonth
          const k = dayKey(d.getFullYear(), d.getMonth(), d.getDate())
          const dayTasks = byDay.get(k) ?? []
          const isToday = k === todayKey
          return (
            <div
              key={i}
              className={cn(
                'flex min-h-0 flex-col gap-1 bg-background p-1.5',
                !inMonth && 'bg-muted/30 text-muted-foreground'
              )}
            >
              <span
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full text-xs tabular-nums',
                  isToday && 'bg-primary font-semibold text-primary-foreground',
                  !isToday && d.getDay() === 0 && inMonth && 'text-rose-400',
                  !isToday && d.getDay() === 6 && inMonth && 'text-sky-400'
                )}
              >
                {d.getDate()}
              </span>

              <div className="flex flex-col gap-0.5 overflow-y-auto">
                {dayTasks.slice(0, 3).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => focusTask(t)}
                    title={t.title}
                    className={cn(
                      'flex items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] transition-colors hover:bg-accent',
                      t.status === 'done' && 'line-through opacity-50'
                    )}
                  >
                    <span
                      className={cn('h-1.5 w-1.5 shrink-0 rounded-full', PRIORITY_META[t.priority].dot)}
                    />
                    <span className="truncate">{t.title}</span>
                  </button>
                ))}
                {dayTasks.length > 3 && (
                  <span className="px-1 text-[11px] text-muted-foreground">
                    +{dayTasks.length - 3}건
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
