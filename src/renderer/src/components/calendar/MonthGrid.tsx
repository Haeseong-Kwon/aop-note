import { useEffect, useState } from 'react'
import { layoutWeek, dayKeyOf } from '@/lib/calendarBars'
import { cn } from '@/lib/utils'
import { WEEKDAYS, dayRange, type CalItem } from './types'

const LANES = 3 // bars shown per week row before "+N"
const LANE_PX = 20
const HEAD_PX = 26

interface MonthGridProps {
  /** The 42 days of the 6-week grid. */
  days: Date[]
  month: number
  items: CalItem[]
  /** Click or drag across days: create a 일정 for that range. */
  onPickRange: (fromDay: string, toDay: string) => void
}

/** Month view: multi-day items as continuous bars, drag across days to create one. */
export function MonthGrid({ days, month, items, onPickRange }: MonthGridProps): JSX.Element {
  const keys = days.map(dayKeyOf)
  const today = dayKeyOf(new Date())
  const [drag, setDrag] = useState<{ from: string; to: string } | null>(null)
  const [more, setMore] = useState<string | null>(null) // day whose overflow list is open

  // A drag that ends outside the grid still finishes.
  useEffect(() => {
    if (!drag) return
    const end = (): void => {
      const [a, b] = [drag.from, drag.to].sort()
      setDrag(null)
      onPickRange(a, b)
    }
    window.addEventListener('pointerup', end, { once: true })
    return () => window.removeEventListener('pointerup', end)
  }, [drag, onPickRange])

  const selected = (k: string): boolean => {
    if (!drag) return false
    const [a, b] = [drag.from, drag.to].sort()
    return k >= a && k <= b
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid grid-cols-7 border-b border-border pb-1">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={cn('px-2 text-xs font-medium text-muted-foreground', i === 0 && 'text-rose-400/80', i === 6 && 'text-sky-400/80')}>
            {w}
          </div>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-rows-6 gap-px overflow-hidden rounded-b-lg bg-border select-none">
        {[0, 1, 2, 3, 4, 5].map((w) => {
          const weekKeys = keys.slice(w * 7, w * 7 + 7)
          const bars = layoutWeek(
            weekKeys,
            items.map((it) => ({ id: it.id, startDay: it.startDay, endDay: it.endDay }))
          )
          const byId = new Map(items.map((it) => [it.id, it]))
          // Items per day hidden below the visible lanes → "+N".
          const hidden = weekKeys.map((_, c) => bars.filter((b) => b.lane >= LANES && c >= b.col && c < b.col + b.span).length)
          return (
            <div key={w} className="relative grid grid-cols-7 gap-px">
              {weekKeys.map((k, c) => {
                const d = days[w * 7 + c]
                const inMonth = d.getMonth() === month
                return (
                  <div
                    key={k}
                    data-day={k}
                    onPointerDown={(e) => {
                      if (e.button !== 0) return
                      setMore(null)
                      setDrag({ from: k, to: k })
                    }}
                    onPointerEnter={() => drag && setDrag({ ...drag, to: k })}
                    title="클릭하거나 여러 날을 드래그해서 일정 추가"
                    className={cn(
                      'relative min-h-0 cursor-cell bg-background p-1 transition-colors hover:bg-accent/30',
                      !inMonth && 'bg-muted/30 text-muted-foreground',
                      selected(k) && 'bg-primary/15 hover:bg-primary/15'
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-5 w-5 items-center justify-center rounded-full text-xs tabular-nums',
                        k === today && 'bg-primary font-semibold text-primary-foreground',
                        k !== today && d.getDay() === 0 && inMonth && 'text-rose-400',
                        k !== today && d.getDay() === 6 && inMonth && 'text-sky-400'
                      )}
                    >
                      {d.getDate()}
                    </span>
                    {hidden[c] > 0 && (
                      <button
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => setMore(more === k ? null : k)}
                        className="absolute bottom-1 left-1 rounded px-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        +{hidden[c]}건
                      </button>
                    )}
                    {more === k && (
                      <DayList
                        day={k}
                        items={items.filter((it) => it.startDay <= k && it.endDay >= k)}
                        onClose={() => setMore(null)}
                      />
                    )}
                  </div>
                )
              })}
              {/* Bars on top of the day cells; clicks go to the item, not the day. */}
              {bars
                .filter((b) => b.lane < LANES)
                .map((b) => {
                  const it = byId.get(b.id) as CalItem
                  return (
                    <button
                      key={`${b.id}:${w}`}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={it.open}
                      title={`${it.title}\n${dayRange(it.startDay, it.endDay)}${it.time ? ` · ${it.time}` : ''}`}
                      className={cn(
                        'absolute z-10 flex h-[18px] items-center gap-1 truncate px-1.5 text-left text-[11px] leading-none transition-[filter] hover:brightness-110',
                        b.continuesLeft ? 'rounded-l-none' : 'rounded-l',
                        b.continuesRight ? 'rounded-r-none' : 'rounded-r',
                        it.done && 'line-through opacity-50'
                      )}
                      style={{
                        top: HEAD_PX + b.lane * LANE_PX,
                        left: `calc(${(b.col / 7) * 100}% + ${b.continuesLeft ? 0 : 3}px)`,
                        width: `calc(${(b.span / 7) * 100}% - ${(b.continuesLeft ? 0 : 3) + (b.continuesRight ? 0 : 3)}px)`,
                        ...(it.kind === 'task'
                          ? { color: 'hsl(var(--foreground))' }
                          : b.span > 1 || !it.time
                            ? { backgroundColor: it.color, color: '#fff' }
                            : { backgroundColor: `${it.color}24`, color: 'hsl(var(--foreground))', borderLeft: `3px solid ${it.color}` })
                      }}
                    >
                      {it.kind === 'task' && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: it.color }} />}
                      {it.time && b.span === 1 && <span className="shrink-0 tabular-nums opacity-80">{it.time}</span>}
                      <span className="truncate">{it.title}</span>
                    </button>
                  )
                })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DayList({ day, items, onClose }: { day: string; items: CalItem[]; onClose: () => void }): JSX.Element {
  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      className="glass-overlay absolute left-1 top-6 z-30 w-56 rounded-lg p-2 text-xs shadow-lg"
      role="dialog"
      aria-label={`${dayRange(day, day)} 일정`}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="font-semibold">{dayRange(day, day)}</span>
        <button onClick={onClose} className="rounded px-1 text-muted-foreground hover:bg-accent" aria-label="닫기">
          ✕
        </button>
      </div>
      <ul className="max-h-60 space-y-0.5 overflow-y-auto">
        {items.map((it) => (
          <li key={it.id}>
            <button onClick={it.open} className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left hover:bg-accent">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: it.color }} />
              {it.time && <span className="shrink-0 tabular-nums text-muted-foreground">{it.time}</span>}
              <span className={cn('truncate', it.done && 'line-through opacity-50')}>{it.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
