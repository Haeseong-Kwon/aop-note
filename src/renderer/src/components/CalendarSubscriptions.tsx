import { useEffect, useState } from 'react'
import { RefreshCw, Trash2, CalendarPlus } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { useToast, toastError } from '@/store/useToast'
import { Button } from '@/components/ui/button'
import { formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { CalendarInfo } from '@shared/types'

const COLORS = ['#3b6ea5', '#2f855a', '#b7791f', '#c53030', '#805ad5', '#319795']

/** Settings section: read-only iCal feeds (Google Calendar's secret address, iCloud, Outlook…). */
export function CalendarSubscriptions(): JSX.Element {
  const bump = useStore((s) => s.bumpCalendarVersion)
  const version = useStore((s) => s.calendarVersion)
  const showToast = useToast((s) => s.show)
  const [calendars, setCalendars] = useState<CalendarInfo[]>([])
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [color, setColor] = useState(COLORS[0])
  const [busy, setBusy] = useState<string | null>(null) // 'add' | calendar id

  useEffect(() => {
    window.api.calendar.list().then(setCalendars, toastError)
  }, [version])

  const subscribe = async (): Promise<void> => {
    setBusy('add')
    try {
      const cal = await window.api.calendar.subscribe({ name, url, color })
      setName('')
      setUrl('')
      bump()
      showToast({ message: `'${cal.name}' 캘린더를 구독했습니다 (일정 ${cal.event_count}개).` })
    } catch (e) {
      toastError(e)
    } finally {
      setBusy(null)
    }
  }

  const sync = async (id: string): Promise<void> => {
    setBusy(id)
    try {
      setCalendars(await window.api.calendar.sync(id))
      bump()
    } catch (e) {
      toastError(e)
    } finally {
      setBusy(null)
    }
  }

  const unsubscribe = async (cal: CalendarInfo): Promise<void> => {
    try {
      await window.api.calendar.unsubscribe(cal.id)
      bump()
      showToast({ message: `'${cal.name}' 구독을 해제했습니다.` })
    } catch (e) {
      toastError(e)
    }
  }

  return (
    <>
      {calendars.map((cal) => (
        <div key={cal.id} className="flex items-center gap-3 py-3">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: cal.color }} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{cal.name}</p>
            <p className={cn('mt-0.5 truncate text-xs', cal.last_error ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground')}>
              {cal.last_error
                ? `동기화 실패: ${cal.last_error} (이전 일정은 그대로 보입니다)`
                : `일정 ${cal.event_count}개 · ${cal.last_sync ? `${formatRelative(cal.last_sync)} 동기화` : '아직 동기화 안 됨'}`}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => sync(cal.id)} disabled={busy === cal.id}>
            <RefreshCw className={cn('h-3.5 w-3.5', busy === cal.id && 'animate-spin')} />
            동기화
          </Button>
          <Button variant="ghost" size="sm" onClick={() => unsubscribe(cal)} aria-label={`${cal.name} 구독 해제`}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}

      <form
        className="space-y-2.5 py-3.5"
        onSubmit={(e) => {
          e.preventDefault()
          void subscribe()
        }}
      >
        <p className="text-sm font-medium">캘린더 구독 추가</p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          구글 캘린더 웹 → 설정 → 왼쪽에서 캘린더 선택 → ‘캘린더 통합’의 <b>iCal 형식의 비공개 주소</b>를 복사해
          붙여 넣으세요. 읽기 전용이며 30분마다 갱신됩니다. 이 주소는 비밀번호와 같아서 키체인에 암호화해 저장합니다.
        </p>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="이름 (예: 업무)"
            aria-label="캘린더 이름"
            className="h-9 w-36 rounded-md border border-input bg-background/70 px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            type="password"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
            aria-label="iCal 비공개 주소"
            autoComplete="off"
            className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background/70 px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5" role="radiogroup" aria-label="색상">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={color === c}
                aria-label={c}
                onClick={() => setColor(c)}
                className={cn('h-5 w-5 rounded-full ring-offset-2 ring-offset-background', color === c && 'ring-2 ring-ring')}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <Button type="submit" size="sm" className="ml-auto" disabled={!url.trim() || busy === 'add'}>
            <CalendarPlus className="h-3.5 w-3.5" />
            {busy === 'add' ? '확인 중…' : '구독'}
          </Button>
        </div>
      </form>
    </>
  )
}
