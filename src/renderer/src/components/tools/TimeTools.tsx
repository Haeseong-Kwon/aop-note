import { useEffect, useState } from 'react'
import { Pause, Play, Plus, RotateCcw, SkipForward, Square, X } from 'lucide-react'
import { addBusinessDays, addDays, businessDaysBetween, daysBetween, fmt, num, parseDay, toDayKey } from '@/lib/toolMath'
import { WEEKDAYS } from '@/components/calendar/types'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { EMPTY, Field, FieldRow, Note, Readout, Segmented, Stat, ToolLayout, usePersistentState } from './ui'

/** Re-renders every `ms` while `on` (for live clocks / timers). */
function useTick(on: boolean, ms = 1000): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!on) return
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [on, ms])
  return now
}

const longDay = (day: string): string => {
  const d = parseDay(day)
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`
}

const parseHolidays = (text: string): Set<string> => new Set(text.match(/\d{4}-\d{2}-\d{2}/g) ?? [])

export function DateTool(): JSX.Element {
  const today = toDayKey(new Date())
  const [mode, setMode] = usePersistentState<'between' | 'add'>('dates.mode', 'between')
  const [from, setFrom] = usePersistentState('dates.from', today)
  const [to, setTo] = usePersistentState('dates.to', '')
  const [n, setN] = usePersistentState('dates.n', '')
  const [holidayText, setHolidayText] = usePersistentState('dates.holidays', '')
  const holidays = parseHolidays(holidayText)
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(from) && (mode === 'add' || /^\d{4}-\d{2}-\d{2}$/.test(to))
  const days = valid && mode === 'between' ? daysBetween(from, to) : NaN
  const biz = valid && mode === 'between' ? (days >= 0 ? businessDaysBetween(from, to, holidays) : -businessDaysBetween(to, from, holidays)) : NaN
  const k = Math.trunc(num(n))
  const plain = valid && mode === 'add' && Number.isFinite(k) && Math.abs(k) <= 36500 ? addDays(from, k) : ''
  const work = valid && mode === 'add' && Number.isFinite(k) && Math.abs(k) <= 3650 ? addBusinessDays(from, k, holidays) : ''
  const dday = valid ? daysBetween(today, mode === 'between' ? to : plain || from) : NaN
  return (
    <ToolLayout
      inputs={
        <>
          <Segmented label="계산" value={mode} onChange={setMode} options={[['between', '두 날짜 사이'], ['add', '날짜 더하기']]} />
          {mode === 'between' ? (
            <FieldRow>
              <Field type="date" label="시작일" value={from} onChange={setFrom} />
              <Field type="date" label="종료일" value={to} onChange={setTo} />
            </FieldRow>
          ) : (
            <FieldRow>
              <Field type="date" label="기준일" value={from} onChange={setFrom} />
              <Field label="더할 일수 (빼려면 음수)" value={n} onChange={setN} suffix="일" placeholder="14" />
            </FieldRow>
          )}
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-muted-foreground">영업일에서 뺄 휴일 (선택)</span>
            <textarea
              value={holidayText}
              onChange={(e) => setHolidayText(e.target.value)}
              rows={2}
              placeholder="2026-10-09, 2026-12-25"
              className="resize-none rounded-xl border border-input bg-background/80 px-3.5 py-2.5 text-[13px] tabular-nums outline-none transition-shadow placeholder:text-muted-foreground/45 focus:border-[color:var(--tool)] focus:shadow-[0_0_0_3px_var(--tool-soft)]"
            />
            <span className="text-[11px] text-muted-foreground/80">주말(토·일)은 항상 제외합니다. 인식한 휴일 {holidays.size}개</span>
          </label>
        </>
      }
      readout={
        mode === 'between' ? (
          <Readout label="기간" value={Number.isFinite(days) ? fmt(days) : EMPTY} unit="일" sub={Number.isFinite(days) ? `시작일 포함 ${fmt(Math.abs(days) + 1)}일` : undefined}>
            <Stat label="영업일 (양 끝 포함)" value={Number.isFinite(biz) ? `${fmt(biz)}일` : EMPTY} strong />
            <Stat label="주 단위" value={Number.isFinite(days) ? `${Math.trunc(days / 7)}주 ${Math.abs(days % 7)}일` : EMPTY} />
            <Stat label="개월 (평균)" value={Number.isFinite(days) ? `${fmt(days / 30.4375, 1)}개월` : EMPTY} />
            <Stat label="오늘 기준 종료일" value={Number.isFinite(dday) ? (dday === 0 ? 'D-Day' : dday > 0 ? `D-${dday}` : `D+${-dday}`) : EMPTY} />
          </Readout>
        ) : (
          <Readout label={Number.isFinite(k) ? `${fmt(k)}일 ${k < 0 ? '전' : '뒤'}` : '결과 날짜'} value={plain ? longDay(plain).replace(/^\d+년 /, '') : EMPTY} sub={plain ? plain.slice(0, 4) + '년' : undefined}>
            <Stat label={`영업일 ${fmt(k)}일 뒤`} value={work ? longDay(work) : EMPTY} strong />
            <Stat label="오늘 기준" value={Number.isFinite(dday) && plain ? (dday === 0 ? 'D-Day' : dday > 0 ? `D-${dday}` : `D+${-dday}`) : EMPTY} />
          </Readout>
        )
      }
    />
  )
}

const ZONES: readonly (readonly [string, string])[] = [
  ['Asia/Seoul', '서울'],
  ['Asia/Tokyo', '도쿄'],
  ['Asia/Shanghai', '베이징·상하이'],
  ['Asia/Singapore', '싱가포르'],
  ['Asia/Ho_Chi_Minh', '호찌민'],
  ['Asia/Kolkata', '뉴델리'],
  ['Asia/Dubai', '두바이'],
  ['Europe/London', '런던'],
  ['Europe/Paris', '파리'],
  ['Europe/Berlin', '베를린'],
  ['America/New_York', '뉴욕'],
  ['America/Chicago', '시카고'],
  ['America/Los_Angeles', '로스앤젤레스·실리콘밸리'],
  ['America/Sao_Paulo', '상파울루'],
  ['Australia/Sydney', '시드니'],
  ['UTC', 'UTC']
]
const zoneName = (z: string): string => ZONES.find(([id]) => id === z)?.[1] ?? z

/** Wall-clock parts of `at` in a zone. */
function partsIn(at: Date, zone: string): { hour: number; minute: number; day: string; offsetMin: number } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(at)
      .map((x) => [x.type, x.value])
  )
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute)
  return { hour: +p.hour, minute: +p.minute, day: `${p.year}-${p.month}-${p.day}`, offsetMin: Math.round((asUtc - Math.floor(at.getTime() / 60000) * 60000) / 60000) }
}

export function TimezoneTool(): JSX.Element {
  const [zones, setZones] = usePersistentState<string[]>('timezone.zones', ['Asia/Seoul', 'America/New_York', 'Europe/London'])
  const [offsetH, setOffsetH] = usePersistentState('timezone.offset', 0)
  const now = useTick(offsetH === 0, 15_000)
  const at = new Date(Math.floor(now / 60000) * 60000 + offsetH * 3_600_000)
  const local = partsIn(at, Intl.DateTimeFormat().resolvedOptions().timeZone)
  const [adding, setAdding] = useState('')
  return (
    <ToolLayout
      inputs={
        <>
          <label className="flex flex-col gap-2">
            <span className="flex justify-between text-[12px] font-medium text-muted-foreground">
              <span>기준 시각 이동</span>
              <span className="tabular-nums">{offsetH === 0 ? '지금' : `${offsetH > 0 ? '+' : ''}${offsetH}시간`}</span>
            </span>
            <input type="range" min={-24} max={24} step={0.5} value={offsetH} onChange={(e) => setOffsetH(Number(e.target.value))} className="accent-[color:var(--tool)]" />
          </label>
          <div className="flex gap-2">
            <select value={adding} onChange={(e) => setAdding(e.target.value)} aria-label="도시 추가" className="field h-9 flex-1">
              <option value="">도시 추가…</option>
              {ZONES.filter(([z]) => !zones.includes(z)).map(([z, name]) => (
                <option key={z} value={z}>
                  {name}
                </option>
              ))}
            </select>
            <Button size="sm" variant="outline" disabled={!adding} onClick={() => (setZones([...zones, adding]), setAdding(''))}>
              <Plus className="h-3.5 w-3.5" /> 추가
            </Button>
          </div>
          <Note>초록 점은 현지 업무 시간(09–18시)입니다. 회의 시간을 잡을 때 슬라이더로 기준 시각을 옮겨 보세요.</Note>
        </>
      }
      readout={
        <section className="tool-plate rounded-[1.25rem] p-2">
          <ul>
            {zones.map((z) => {
              const p = partsIn(at, z)
              const dayShift = daysBetween(local.day, p.day)
              const working = p.hour >= 9 && p.hour < 18
              const diff = (p.offsetMin - local.offsetMin) / 60
              return (
                <li key={z} className="group flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-background/40">
                  <span className={cn('h-2 w-2 shrink-0 rounded-full', working ? 'bg-emerald-500' : 'bg-muted-foreground/30')} title={working ? '업무 시간' : '업무 시간 외'} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{zoneName(z)}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {diff === 0 ? '현지와 같음' : `${diff > 0 ? '+' : ''}${diff}시간`}
                      {dayShift !== 0 && (dayShift > 0 ? ' · 다음 날' : ' · 전날')}
                    </span>
                  </span>
                  <span className="text-[1.6rem] font-semibold tabular-nums tracking-[-0.02em]">
                    {String(p.hour).padStart(2, '0')}:{String(p.minute).padStart(2, '0')}
                  </span>
                  <button onClick={() => setZones(zones.filter((x) => x !== z))} aria-label={`${zoneName(z)} 삭제`} className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground opacity-0 transition hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      }
    />
  )
}

type Phase = 'focus' | 'break'
interface TimerState {
  phase: Phase
  /** Running: when it ends (epoch ms). Paused: null. */
  endsAt: number | null
  /** Paused: ms left. */
  leftMs: number
  rounds: number
}

const notify = (body: string): void => {
  try {
    new Notification('AOP Note 타이머', { body, silent: false })
  } catch {
    /* notifications unavailable */
  }
}

export function TimerTool(): JSX.Element {
  const [focusMin, setFocusMin] = usePersistentState('timer.focus', '25')
  const [breakMin, setBreakMin] = usePersistentState('timer.break', '5')
  const lengthMs = (p: Phase): number => Math.max(1, num(p === 'focus' ? focusMin : breakMin) || 1) * 60_000
  const [t, setT] = usePersistentState<TimerState>('timer.state', { phase: 'focus', endsAt: null, leftMs: 25 * 60_000, rounds: 0 })
  const running = t.endsAt !== null
  const now = useTick(running, 250)
  const left = running ? Math.max(0, (t.endsAt ?? 0) - now) : t.leftMs

  useEffect(() => {
    if (!running || left > 0) return
    const next: Phase = t.phase === 'focus' ? 'break' : 'focus'
    notify(t.phase === 'focus' ? '집중 시간이 끝났습니다. 잠깐 쉬세요.' : '휴식이 끝났습니다. 다시 집중할 시간입니다.')
    setT({ phase: next, endsAt: Date.now() + lengthMs(next), leftMs: lengthMs(next), rounds: t.rounds + (t.phase === 'focus' ? 1 : 0) })
  }, [running, left]) // eslint-disable-line react-hooks/exhaustive-deps -- fires once when the countdown hits 0

  const total = lengthMs(t.phase)
  const progress = 1 - left / total
  const mm = String(Math.floor(left / 60000)).padStart(2, '0')
  const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, '0')
  const R = 88
  const C = 2 * Math.PI * R
  const reset = (phase: Phase = t.phase): void => setT({ phase, endsAt: null, leftMs: lengthMs(phase), rounds: t.rounds })

  return (
    <ToolLayout
      inputs={
        <>
          <FieldRow>
            <Field label="집중" value={focusMin} onChange={setFocusMin} suffix="분" />
            <Field label="휴식" value={breakMin} onChange={setBreakMin} suffix="분" />
          </FieldRow>
          <div className="flex flex-wrap gap-2">
            {[
              ['25/5', '25', '5'],
              ['50/10', '50', '10'],
              ['90/20', '90', '20']
            ].map(([label, f, b]) => (
              <button
                key={label}
                onClick={() => {
                  setFocusMin(f)
                  setBreakMin(b)
                  setT({ phase: 'focus', endsAt: null, leftMs: Number(f) * 60_000, rounds: t.rounds })
                }}
                className="h-7 rounded-full border border-border px-3 text-[12px] text-muted-foreground hover:border-[color:var(--tool)] hover:text-foreground"
              >
                {label}
              </button>
            ))}
          </div>
          <Note>시간을 바꾼 뒤 초기화하면 적용됩니다. 끝나면 알림을 보내고 다음 단계로 넘어갑니다. 다른 도구로 이동해도 계속 흐릅니다.</Note>
        </>
      }
      readout={
        <section className="tool-plate flex flex-col items-center rounded-[1.25rem] p-6">
          <div className="relative">
            <svg width={200} height={200} viewBox="0 0 200 200" className="-rotate-90" aria-hidden>
              <circle cx={100} cy={100} r={R} fill="none" stroke="var(--tool-line)" strokeWidth={8} />
              <circle
                cx={100}
                cy={100}
                r={R}
                fill="none"
                stroke={t.phase === 'focus' ? 'var(--tool)' : '#10b981'}
                strokeWidth={8}
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={C * (1 - progress)}
                className="transition-[stroke-dashoffset] duration-300 ease-linear"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[12px] font-medium text-muted-foreground">{t.phase === 'focus' ? '집중' : '휴식'}</span>
              <output className="text-[2.75rem] font-semibold tabular-nums tracking-[-0.03em]">
                {mm}:{ss}
              </output>
              <span className="text-[11px] text-muted-foreground">완료 {t.rounds}회</span>
            </div>
          </div>
          <div className="mt-5 flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => reset()} aria-label="초기화" title="초기화">
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button
              className="h-11 w-28 rounded-full bg-[color:var(--tool)] text-white hover:opacity-90"
              onClick={() => setT(running ? { ...t, endsAt: null, leftMs: left } : { ...t, endsAt: Date.now() + left })}
            >
              {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {running ? '일시정지' : '시작'}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => reset(t.phase === 'focus' ? 'break' : 'focus')} aria-label="다음 단계로" title="다음 단계로">
              <SkipForward className="h-4 w-4" />
            </Button>
          </div>
        </section>
      }
    />
  )
}

interface MeetingState {
  startedAt: number | null
  /** Accumulated ms from earlier runs. */
  elapsed: number
}

export function MeetingCostTool(): JSX.Element {
  const [people, setPeople] = usePersistentState('meeting.people', '')
  const [salary, setSalary] = usePersistentState('meeting.salary', '')
  const [overhead, setOverhead] = usePersistentState('meeting.overhead', '30')
  const [planned, setPlanned] = usePersistentState('meeting.planned', '')
  const [m, setM] = usePersistentState<MeetingState>('meeting.state', { startedAt: null, elapsed: 0 })
  const now = useTick(m.startedAt !== null, 200)
  const elapsed = m.elapsed + (m.startedAt !== null ? now - m.startedAt : 0)
  // Annual salary → hourly cost incl. benefits/overhead, over ~2,080 work hours a year.
  const perHour = ((num(salary) * (1 + (num(overhead) || 0) / 100)) / 2080) * num(people)
  const cost = (perHour * elapsed) / 3_600_000
  const plannedCost = (perHour * num(planned)) / 60
  const hh = Math.floor(elapsed / 3_600_000)
  const clock = `${hh ? `${hh}:` : ''}${String(Math.floor((elapsed % 3_600_000) / 60000)).padStart(2, '0')}:${String(Math.floor((elapsed % 60000) / 1000)).padStart(2, '0')}`
  return (
    <ToolLayout
      inputs={
        <>
          <FieldRow>
            <Field label="참석 인원" value={people} onChange={setPeople} suffix="명" placeholder="6" />
            <Field won label="평균 연봉" value={salary} onChange={setSalary} placeholder="60,000,000" />
          </FieldRow>
          <FieldRow>
            <Field label="간접비 (4대보험·복리후생)" value={overhead} onChange={setOverhead} suffix="%" />
            <Field label="예정 시간 (선택)" value={planned} onChange={setPlanned} suffix="분" placeholder="60" />
          </FieldRow>
          <Note>연 2,080시간 근무 기준. 회의를 시작하면 비용이 실시간으로 올라갑니다.</Note>
        </>
      }
      readout={
        <Readout label={`회의 비용 · ${clock}`} value={Number.isFinite(cost) ? fmt(Math.floor(cost)) : EMPTY} unit="원" sub={Number.isFinite(perHour) ? `분당 ${fmt(Math.round(perHour / 60))}원` : undefined}>
          <Stat label={`예정 ${fmt(num(planned))}분 기준`} value={Number.isFinite(plannedCost) ? `${fmt(Math.round(plannedCost))}원` : EMPTY} strong />
          <Stat label="시간당" value={Number.isFinite(perHour) ? `${fmt(Math.round(perHour))}원` : EMPTY} />
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              className="flex-1 bg-[color:var(--tool)] text-white hover:opacity-90"
              onClick={() => setM(m.startedAt !== null ? { startedAt: null, elapsed } : { ...m, startedAt: Date.now() })}
            >
              {m.startedAt !== null ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {m.startedAt !== null ? '일시정지' : elapsed > 0 ? '계속' : '회의 시작'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setM({ startedAt: null, elapsed: 0 })} disabled={elapsed === 0}>
              <Square className="h-3.5 w-3.5" /> 초기화
            </Button>
          </div>
        </Readout>
      }
    />
  )
}
