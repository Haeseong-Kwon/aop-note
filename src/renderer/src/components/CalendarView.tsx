import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, List, Plus } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { useToast, toastError } from '@/store/useToast'
import { Button } from '@/components/ui/button'
import { eventDayKeys, formatEventTime } from '@/lib/format'
import { useCalendarEvents } from '@/hooks/useCalendarEvents'
import { dayKeyOf } from '@/lib/calendarBars'
import { cn } from '@/lib/utils'
import type { Schedule } from '@shared/types'
import { MonthGrid } from './calendar/MonthGrid'
import { ScheduleDialog, type ScheduleDraft } from './calendar/ScheduleDialog'
import { dayRange, type CalItem } from './calendar/types'

type CalendarMode = 'month' | 'agenda'
const AGENDA_DAYS = 60
const MODE_KEY = 'aop-calendar-mode'
// Task dots by priority (none / low / medium / high), matching PRIORITY_META's dots.
const PRIORITY_COLOR = ['#94a3b8', '#38bdf8', '#fbbf24', '#fb7185'] as const

const hhmm = (iso: string): string => {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** The desk's calendar: its 일정 (multi-day as bars), task due dates and subscribed calendars. */
export function CalendarView(): JSX.Element {
  const tasks = useStore((s) => s.tasks)
  const deskId = useStore((s) => s.activeWorkspaceId)
  const calYear = useStore((s) => s.calYear)
  const calMonth = useStore((s) => s.calMonth)
  const shiftMonth = useStore((s) => s.shiftMonth)
  const goToToday = useStore((s) => s.goToToday)
  const focusTask = useStore((s) => s.focusTask)
  const showToast = useToast((s) => s.show)
  const [mode, setModeState] = useState<CalendarMode>(() => {
    try {
      return localStorage.getItem(MODE_KEY) === 'agenda' ? 'agenda' : 'month'
    } catch {
      return 'month'
    }
  })
  const setMode = (m: CalendarMode): void => {
    setModeState(m)
    try {
      localStorage.setItem(MODE_KEY, m)
    } catch {
      /* not remembered */
    }
  }
  const [draft, setDraft] = useState<ScheduleDraft | null>(null)
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [version, setVersion] = useState(0)

  // 6-week grid from the Sunday on/before the 1st; the agenda looks ahead from today.
  const days = useMemo(() => {
    const first = new Date(calYear, calMonth, 1)
    return Array.from({ length: 42 }, (_, i) => new Date(calYear, calMonth, 1 - first.getDay() + i))
  }, [calYear, calMonth])
  const today = new Date()
  const [from, to] =
    mode === 'month'
      ? [days[0], days[41]]
      : [new Date(today.getFullYear(), today.getMonth(), today.getDate()), new Date(today.getFullYear(), today.getMonth(), today.getDate() + AGENDA_DAYS)]
  const fromDay = dayKeyOf(from)
  const toDay = dayKeyOf(to)

  useEffect(() => {
    let current = true
    window.api.schedule.list(fromDay, toDay, deskId).then((s) => current && setSchedules(s), toastError)
    return () => {
      current = false
    }
  }, [fromDay, toDay, deskId, version])
  const { events } = useCalendarEvents(from, new Date(to.getTime() + 86_400_000))

  const changed = useCallback(
    (message: string, undo?: () => void) => {
      setVersion((v) => v + 1)
      showToast({
        message,
        ...(undo && {
          actionLabel: '되돌리기',
          onAction: () => {
            undo()
            setTimeout(() => setVersion((v) => v + 1), 100)
          }
        })
      })
    },
    [showToast]
  )

  const items = useMemo<CalItem[]>(() => {
    const out: CalItem[] = schedules.map((s) => ({
      id: `s:${s.id}`,
      kind: 'schedule',
      title: s.title,
      color: s.color,
      startDay: s.start_day,
      endDay: s.end_day,
      time: s.all_day ? '' : hhmm(s.start),
      open: () => setDraft({ mode: 'edit', schedule: s })
    }))
    for (const e of events) {
      const keys = eventDayKeys(e)
      if (keys.length === 0) continue
      out.push({
        id: `e:${e.id}`,
        kind: 'event',
        title: e.title,
        color: e.color,
        startDay: keys[0],
        endDay: keys[keys.length - 1],
        time: e.all_day ? '' : formatEventTime(e).slice(0, 5),
        open: () => showToast({ message: `${e.title} · ${e.calendar_name} (구독 캘린더, 읽기 전용)` })
      })
    }
    for (const t of tasks) {
      if (!t.due_date) continue
      const day = dayKeyOf(new Date(t.due_date))
      if (day < fromDay || day > toDay) continue
      out.push({
        id: `t:${t.id}`,
        kind: 'task',
        title: t.title,
        color: PRIORITY_COLOR[t.priority],
        startDay: day,
        endDay: day,
        time: '',
        done: t.status === 'done',
        open: () => focusTask(t)
      })
    }
    return out
  }, [schedules, events, tasks, fromDay, toDay, focusTask, showToast])

  const newToday = (): void => {
    const d = dayKeyOf(new Date())
    setDraft({ mode: 'new', fromDay: d, toDay: d })
  }

  return (
    <div className="cq flex h-full flex-col p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          {mode === 'month' ? `${calYear}년 ${calMonth + 1}월` : `다가오는 일정 · ${AGENDA_DAYS}일`}
        </h2>
        {mode === 'month' && (
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => shiftMonth(-1)} aria-label="이전 달">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => shiftMonth(1)} aria-label="다음 달">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={goToToday}>
              오늘
            </Button>
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <div role="group" aria-label="보기" className="flex h-8 items-center rounded-md border border-border p-0.5 text-xs">
            {(
              [
                ['month', '월', CalendarDays],
                ['agenda', '일정 목록', List]
              ] as const
            ).map(([m, label, Icon]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                title={label}
                className={cn('flex h-full items-center gap-1 rounded px-2 transition-colors', mode === m ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground')}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="cq-hide-sm">{label}</span>
              </button>
            ))}
          </div>
          <Button size="sm" onClick={newToday} title="새 일정" aria-label="새 일정">
            <Plus className="h-4 w-4" />
            <span className="cq-hide-sm">새 일정</span>
          </Button>
        </div>
      </div>

      {mode === 'month' ? (
        <MonthGrid days={days} month={calMonth} items={items} onPickRange={(a, b) => setDraft({ mode: 'new', fromDay: a, toDay: b })} />
      ) : (
        <Agenda items={items} fromDay={fromDay} />
      )}
      {mode === 'month' && <p className="mt-2 text-[11px] text-muted-foreground">날짜를 클릭하거나 여러 날을 드래그해서 일정을 추가하세요.</p>}

      {draft && <ScheduleDialog key={draft.mode === 'edit' ? draft.schedule.id : `${draft.fromDay}~${draft.toDay}`} draft={draft} onClose={() => setDraft(null)} onChanged={changed} />}
    </div>
  )
}

/** Upcoming items by start day; ones already running show under today. */
function Agenda({ items, fromDay }: { items: CalItem[]; fromDay: string }): JSX.Element {
  const groups = useMemo(() => {
    const byDay = new Map<string, CalItem[]>()
    for (const it of [...items].sort((a, b) => a.startDay.localeCompare(b.startDay) || a.time.localeCompare(b.time))) {
      const day = it.startDay < fromDay ? fromDay : it.startDay
      byDay.set(day, [...(byDay.get(day) ?? []), it])
    }
    return [...byDay.entries()]
  }, [items, fromDay])

  if (groups.length === 0) {
    return <p className="m-auto text-sm text-muted-foreground">앞으로 {AGENDA_DAYS}일 안에 일정이 없습니다. ‘새 일정’으로 추가하세요.</p>
  }
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {groups.map(([day, list]) => (
        <section key={day} className="mb-4">
          <h3 className="sticky top-0 z-10 bg-background/90 py-1 text-xs font-semibold text-muted-foreground backdrop-blur">
            {dayRange(day, day)}
            {day === dayKeyOf(new Date()) && <span className="ml-1.5 rounded bg-primary/15 px-1.5 text-primary">오늘</span>}
          </h3>
          <ul className="space-y-1">
            {list.map((it) => (
              <li key={it.id}>
                <button onClick={it.open} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-accent/60">
                  <span className="h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: it.color }} />
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate text-sm font-medium', it.done && 'line-through opacity-50')}>{it.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {it.startDay !== it.endDay ? dayRange(it.startDay, it.endDay) : it.time || '종일'}
                      {it.kind === 'task' && ' · 작업 마감'}
                      {it.kind === 'event' && ' · 구독 캘린더'}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
