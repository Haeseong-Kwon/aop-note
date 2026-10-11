import { addMonths, annualLeave, daysBetween, fmt, koreanWon, num, severance, toDayKey, workedMinutes } from '@/lib/toolMath'
import { WEEKDAYS } from '@/components/calendar/types'
import { cn } from '@/lib/utils'
import { EMPTY, Field, FieldGroup, FieldRow, Note, NumInput, Readout, Stat, ToolLayout, usePersistentState } from './ui'

const isDay = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s)
const today = (): string => toDayKey(new Date())

export function LeaveTool(): JSX.Element {
  const [hire, setHire] = usePersistentState('leave.hire', '')
  const [asOf, setAsOf] = usePersistentState('leave.asof', '')
  const at = asOf || today()
  const ok = isDay(hire) && isDay(at) && hire <= at
  const r = ok ? annualLeave(hire, at) : null
  // Next change: the next full month in year 1, else the next work anniversary.
  const next = r ? (r.firstYear ? addMonths(hire, r.months + 1) : addMonths(hire, (r.years + 1) * 12)) : ''
  const nextDays = r && next ? annualLeave(hire, next).days : 0
  return (
    <ToolLayout
      inputs={
        <>
          <FieldRow>
            <Field type="date" label="입사일" value={hire} onChange={setHire} />
            <Field type="date" label="기준일 (비우면 오늘)" value={asOf} onChange={setAsOf} />
          </FieldRow>
          <Note>근로기준법 제60조, 입사일 기준이며 출근율 80% 이상을 가정합니다. 1년 미만은 한 달 개근마다 1일(최대 11일), 1년 이상은 15일에 2년마다 1일씩 더해 최대 25일입니다. 회사가 회계연도 기준으로 운영하면 다를 수 있습니다.</Note>
        </>
      }
      readout={
        <Readout
          label={r?.firstYear ? '지금까지 생긴 월차' : '올해 연차'}
          value={r ? String(r.days) : EMPTY}
          unit="일"
          sub={r ? `근속 ${r.years}년 ${r.months % 12}개월` : undefined}
          emptyHint="입사일을 입력하세요"
        >
          {r && next && <Stat label={`${next} 부터`} value={`${nextDays}일`} strong />}
          {r && <Stat label="근속 일수" value={`${fmt(daysBetween(hire, at))}일`} />}
          {r?.firstYear && <Stat label="1년 되는 날 발생" value="15일" />}
        </Readout>
      }
    />
  )
}

export function SeveranceTool(): JSX.Element {
  const [start, setStart] = usePersistentState('severance.start', '')
  const [end, setEnd] = usePersistentState('severance.end', '')
  const [pay, setPay] = usePersistentState('severance.pay', '')
  const [bonus, setBonus] = usePersistentState('severance.bonus', '')
  const [leavePay, setLeavePay] = usePersistentState('severance.leave', '')
  const ok = isDay(start) && isDay(end) && start < end && Number.isFinite(num(pay))
  const r = ok ? severance(start, end, num(pay), num(bonus) || 0, num(leavePay) || 0) : null
  return (
    <ToolLayout
      inputs={
        <>
          <FieldRow>
            <Field type="date" label="입사일" value={start} onChange={setStart} />
            <Field type="date" label="퇴사일 (마지막 근무 다음 날)" value={end} onChange={setEnd} />
          </FieldRow>
          <Field won label="퇴사 전 3개월 급여 총액 (세전)" value={pay} onChange={setPay} placeholder="10,500,000" hint="기본급과 정기 수당을 합한 금액" />
          <FieldGroup title="선택 항목">
            <FieldRow>
              <Field won label="직전 1년 상여금" value={bonus} onChange={setBonus} placeholder="0" />
              <Field won label="직전 1년 연차수당" value={leavePay} onChange={setLeavePay} placeholder="0" />
            </FieldRow>
          </FieldGroup>
          <Note>1일 평균임금 × 30일 × 재직일수 ÷ 365로 추정합니다. 1년 이상 근무해야 받을 수 있으며, 실제 금액은 통상임금 비교와 퇴직소득세에 따라 달라집니다.</Note>
        </>
      }
      readout={
        <Readout
          label="예상 퇴직금 (세전)"
          value={r ? fmt(r.amount) : EMPTY}
          unit="원"
          sub={r ? (r.eligible ? koreanWon(r.amount) : '재직 1년 미만이라 지급 대상이 아닙니다') : undefined}
          emptyHint="입사일, 퇴사일, 3개월 급여를 입력하세요"
        >
          <Stat label="재직 일수" value={r ? `${fmt(r.serviceDays)}일` : EMPTY} />
          <Stat label="1일 평균임금" value={r ? `${fmt(Math.round(r.dailyWage))}원` : EMPTY} />
          <Stat label="30일분 평균임금" value={r ? `${fmt(Math.round(r.dailyWage * 30))}원` : EMPTY} strong />
        </Readout>
      }
    />
  )
}

interface DayHours {
  start: string
  end: string
  rest: string
}
const blankWeek = (): DayHours[] => Array.from({ length: 7 }, () => ({ start: '', end: '', rest: '' }))
const ORDER = [1, 2, 3, 4, 5, 6, 0] // 월 … 일
const hm = (min: number): string => `${Math.floor(min / 60)}시간${min % 60 ? ` ${min % 60}분` : ''}`

export function WorkHoursTool(): JSX.Element {
  const [week, setWeek] = usePersistentState<DayHours[]>('work-hours.week', blankWeek())
  const set = (i: number, patch: Partial<DayHours>): void => setWeek(week.map((d, j) => (j === i ? { ...d, ...patch } : d)))
  const minutes = week.map((d) => workedMinutes(d.start, d.end, d.rest === '' ? defaultRest(d) : num(d.rest)))
  const total = minutes.reduce<number>((s, m) => s + (m ?? 0), 0)
  const daysWorked = minutes.filter((m) => m !== null).length
  const overtime = Math.max(0, total - 40 * 60)
  const status = total > 52 * 60 ? 'over' : total > 40 * 60 ? 'ot' : 'ok'
  const fillWeekdays = (): void => {
    const first = week.find((d) => d.start && d.end)
    if (first) setWeek(week.map((d, i) => (i < 5 ? { ...first } : d)))
  }
  return (
    <ToolLayout
      wide
      inputs={
        <>
          <div className="flex flex-col gap-1.5">
            <div className="grid grid-cols-[2rem_1fr_1fr_4.5rem_4.5rem] items-center gap-2 text-[11px] font-medium text-muted-foreground">
              <span />
              <span>출근</span>
              <span>퇴근</span>
              <span className="text-right">휴게 (분)</span>
              <span className="text-right">근무</span>
            </div>
            {ORDER.map((dow, i) => (
              <div key={dow} className="grid grid-cols-[2rem_1fr_1fr_4.5rem_4.5rem] items-center gap-2">
                <span className={cn('text-[13px] font-medium', dow === 0 ? 'text-rose-500' : dow === 6 ? 'text-sky-500' : 'text-foreground/80')}>{WEEKDAYS[dow]}</span>
                <input type="time" value={week[i].start} onChange={(e) => set(i, { start: e.target.value })} aria-label={`${WEEKDAYS[dow]}요일 출근`} className="field h-9 rounded-lg" />
                <input type="time" value={week[i].end} onChange={(e) => set(i, { end: e.target.value })} aria-label={`${WEEKDAYS[dow]}요일 퇴근`} className="field h-9 rounded-lg" />
                <NumInput value={week[i].rest} onChange={(v) => set(i, { rest: v })} aria-label={`${WEEKDAYS[dow]}요일 휴게`} placeholder={String(defaultRest(week[i]))} className="field h-9 rounded-lg text-right tabular-nums placeholder:text-muted-foreground/40" />
                <span className={cn('text-right text-[13px] tabular-nums', minutes[i] === null && 'text-muted-foreground/40')}>{minutes[i] === null ? EMPTY : hm(minutes[i] as number)}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={fillWeekdays} className="h-8 rounded-lg border border-border px-3 text-[12px] text-muted-foreground transition-colors hover:border-[color:var(--tool)] hover:text-foreground">
              첫 입력을 평일 전체에 복사
            </button>
            <button onClick={() => setWeek(blankWeek())} className="h-8 rounded-lg px-3 text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground">
              비우기
            </button>
          </div>
          <Note>휴게를 비우면 법정 최소(4시간 이상 30분, 8시간 이상 1시간)로 계산합니다. 연장근로는 주 40시간 초과분, 한도는 주 52시간 기준입니다.</Note>
        </>
      }
      readout={
        <Readout label="주간 근무시간" value={daysWorked ? fmt(total / 60, 1) : EMPTY} unit="시간" sub={daysWorked ? `${daysWorked}일 근무 · 하루 평균 ${hm(Math.round(total / daysWorked))}` : undefined} emptyHint="출근과 퇴근 시각을 입력하세요">
          <Stat label="연장근로 (40시간 초과)" value={daysWorked ? hm(overtime) : EMPTY} strong />
          <Stat label="52시간까지 남은 시간" value={daysWorked ? (total > 52 * 60 ? '초과' : hm(52 * 60 - total)) : EMPTY} />
          {daysWorked > 0 && (
            <>
              <div className="relative mt-3 h-2.5 overflow-hidden rounded-full bg-muted">
                <span className={cn('absolute inset-y-0 left-0 rounded-full transition-[width] duration-slow', status === 'over' ? 'bg-rose-500' : status === 'ot' ? 'bg-amber-500' : 'bg-[color:var(--tool)]')} style={{ width: `${Math.min(100, (total / (60 * 60)) * 100)}%` }} />
                <span className="absolute inset-y-0 w-px bg-foreground/40" style={{ left: `${(40 / 60) * 100}%` }} title="40시간" />
                <span className="absolute inset-y-0 w-px bg-rose-500/70" style={{ left: `${(52 / 60) * 100}%` }} title="52시간" />
              </div>
              <div className="relative mt-1 h-4 text-[10.5px] text-muted-foreground">
                <span className="absolute -translate-x-1/2" style={{ left: `${(40 / 60) * 100}%` }}>40</span>
                <span className="absolute -translate-x-1/2 text-rose-500" style={{ left: `${(52 / 60) * 100}%` }}>52</span>
              </div>
            </>
          )}
        </Readout>
      }
    />
  )
}

/** 근로기준법 제54조 minimum break for the span (before the break). */
function defaultRest(d: DayHours): number {
  const span = workedMinutes(d.start, d.end, 0)
  if (span === null) return 60
  return span >= 8 * 60 + 60 ? 60 : span >= 4 * 60 + 30 ? 30 : 0
}

