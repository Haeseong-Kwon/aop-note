import { useState } from 'react'
import { CalendarDays, Layers, MapPin, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useStore } from '@/store/useStore'
import { toastError } from '@/store/useToast'
import { cn } from '@/lib/utils'
import type { Schedule } from '@shared/types'

export const SCHEDULE_COLORS = ['#6366f1', '#3b82f6', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#64748b']

/** New: a day range (from a click / drag); edit: an existing schedule. */
export type ScheduleDraft = { mode: 'new'; fromDay: string; toDay: string } | { mode: 'edit'; schedule: Schedule }

const pad = (n: number): string => String(n).padStart(2, '0')
const localDay = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const localTime = (d: Date): string => `${pad(d.getHours())}:${pad(d.getMinutes())}`
const toIso = (day: string, time: string): string => {
  const [y, m, d] = day.split('-').map(Number)
  const [h, min] = time.split(':').map(Number)
  return new Date(y, m - 1, d, h, min).toISOString()
}

interface ScheduleDialogProps {
  draft: ScheduleDraft
  onClose: () => void
  /** After a save / delete (the calendar reloads). */
  onChanged: (message: string, undo?: () => void) => void
}

export function ScheduleDialog({ draft, onClose, onChanged }: ScheduleDialogProps): JSX.Element {
  const workspaces = useStore((s) => s.workspaces)
  const activeDesk = useStore((s) => s.activeWorkspaceId)
  const openQuickCapture = useStore((s) => s.openQuickCapture)
  const existing = draft.mode === 'edit' ? draft.schedule : null
  const timedStart = existing && !existing.all_day ? new Date(existing.start) : null
  const timedEnd = existing && !existing.all_day ? new Date(existing.end) : null

  const [title, setTitle] = useState(existing?.title ?? '')
  const [allDay, setAllDay] = useState(existing?.all_day ?? true)
  const [startDay, setStartDay] = useState(existing ? existing.start_day : draft.mode === 'new' ? draft.fromDay : '')
  const [endDay, setEndDay] = useState(existing ? existing.end_day : draft.mode === 'new' ? draft.toDay : '')
  const [startTime, setStartTime] = useState(timedStart ? localTime(timedStart) : '09:00')
  const [endTime, setEndTime] = useState(timedEnd ? localTime(timedEnd) : '10:00')
  const [desk, setDesk] = useState<string>(existing ? (existing.workspace_id ?? '') : (activeDesk ?? ''))
  const [color, setColor] = useState(existing?.color ?? SCHEDULE_COLORS[0])
  const [location, setLocation] = useState(existing?.location ?? '')
  const [note, setNote] = useState(existing?.note ?? '')
  const [saving, setSaving] = useState(false)

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      const fields = {
        title,
        all_day: allDay,
        start: allDay ? startDay : toIso(startDay, startTime),
        end: allDay ? endDay : toIso(endDay, endTime),
        workspace_id: desk || null,
        color,
        location,
        note
      }
      if (existing) await window.api.schedule.update({ id: existing.id, ...fields })
      else await window.api.schedule.create(fields)
      onChanged(existing ? '일정을 수정했습니다.' : '일정을 추가했습니다.')
      onClose()
    } catch (e) {
      toastError(e)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (): Promise<void> => {
    if (!existing) return
    try {
      await window.api.schedule.remove(existing.id)
      onChanged(`‘${existing.title}’ 일정을 삭제했습니다.`, () => void window.api.schedule.restore(existing.id))
      onClose()
    } catch (e) {
      toastError(e)
    }
  }

  // Keep the range valid while editing: moving the start past the end drags the end along.
  const changeStart = (day: string): void => {
    setStartDay(day)
    if (day > endDay) setEndDay(day)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md gap-0 p-0">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
          className="flex flex-col gap-3 p-5"
        >
          <DialogTitle className="sr-only">{existing ? '일정 수정' : '새 일정'}</DialogTitle>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="일정 제목"
            aria-label="일정 제목"
            className="border-b border-border bg-transparent pb-2 text-lg font-semibold outline-none placeholder:text-muted-foreground/60 focus:border-primary"
          />

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="accent-[hsl(var(--primary))]" />
            종일
          </label>

          <div className="grid grid-cols-[1.5rem_1fr] items-center gap-x-2 gap-y-2 text-sm">
            <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden />
            <div className="flex flex-wrap items-center gap-2">
              <input type="date" value={startDay} onChange={(e) => changeStart(e.target.value)} aria-label="시작일" className="field" />
              {!allDay && <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} aria-label="시작 시간" className="field" />}
              <span className="text-muted-foreground">~</span>
              <input type="date" value={endDay} min={startDay} onChange={(e) => setEndDay(e.target.value)} aria-label="종료일" className="field" />
              {!allDay && <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} aria-label="종료 시간" className="field" />}
            </div>
            <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden />
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="장소 (선택)" aria-label="장소" className="field" />
            <Layers className="h-4 w-4 text-muted-foreground" aria-hidden />
            <select value={desk} onChange={(e) => setDesk(e.target.value)} aria-label="데스크" className="field">
              <option value="">데스크 없음</option>
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5" role="radiogroup" aria-label="색">
            {SCHEDULE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={color === c}
                aria-label={`색 ${c}`}
                onClick={() => setColor(c)}
                className={cn('h-5 w-5 rounded-full transition-transform', color === c ? 'scale-110 ring-2 ring-foreground/60 ring-offset-2 ring-offset-background' : 'hover:scale-110')}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="메모 (선택)"
            aria-label="메모"
            rows={3}
            className="resize-none rounded-md border border-input bg-background/60 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />

          <div className="flex items-center gap-2 pt-1">
            {existing ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => void remove()} className="text-destructive hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
                삭제
              </Button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  onClose()
                  openQuickCapture(startDay)
                }}
                className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                대신 작업(마감일)으로 추가
              </button>
            )}
            <div className="ml-auto flex gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                취소
              </Button>
              <Button type="submit" size="sm" disabled={saving || !title.trim()}>
                {existing ? '저장' : '추가'}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export { localDay }
