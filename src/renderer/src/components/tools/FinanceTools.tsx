import { useMemo } from 'react'
import { breakEvenUnits, cagr, fmt, futureValue, irr, koreanWon, loanSchedule, monthlyHours, npv, num, vat, type RepayMethod } from '@/lib/toolMath'
import { AddButton, EMPTY, Field, FieldRow, Note, NumInput, Readout, RemoveButton, Segmented, SplitBar, Stat, ToolLayout, usePersistentState } from './ui'

const won = (n: number): string => (Number.isFinite(n) ? fmt(Math.round(n)) : EMPTY)
const wonText = (n: number): string => (Number.isFinite(n) ? `${fmt(Math.round(n))}원` : EMPTY)
const pct = (n: number, d = 1): string => (Number.isFinite(n) ? `${fmt(n, d)}%` : EMPTY)
const C_MAIN = 'var(--tool)'
const C_SOFT = 'hsl(var(--muted-foreground) / 0.35)'

export function VatTool(): JSX.Element {
  const [mode, setMode] = usePersistentState<'total' | 'supply'>('vat.mode', 'total')
  const [amount, setAmount] = usePersistentState('vat.amount', '')
  const [rate, setRate] = usePersistentState('vat.rate', '10')
  const a = num(amount)
  const ok = Number.isFinite(a)
  const r = vat(ok ? a : NaN, mode, num(rate) || 0)
  const headline = mode === 'total' ? r.supply : r.total
  return (
    <ToolLayout
      inputs={
        <>
          <Segmented label="입력 기준" value={mode} onChange={setMode} options={[['total', '합계금액에서 나누기'], ['supply', '공급가액에 더하기']]} />
          <Field won label={mode === 'total' ? '합계금액 (부가세 포함)' : '공급가액 (부가세 별도)'} value={amount} onChange={setAmount} placeholder="110,000" />
          <Field label="세율" value={rate} onChange={setRate} suffix="%" hint="일반과세자 10%" />
        </>
      }
      readout={
        <Readout label={mode === 'total' ? '공급가액' : '합계금액'} value={ok ? won(headline) : EMPTY} unit="원" sub={ok ? koreanWon(headline) : undefined}>
          <Stat label="공급가액" value={ok ? wonText(r.supply) : EMPTY} />
          <Stat label="부가세" value={ok ? wonText(r.tax) : EMPTY} />
          <Stat label="합계" value={ok ? wonText(r.total) : EMPTY} strong />
        </Readout>
      }
    />
  )
}

export function MarginTool(): JSX.Element {
  const [cost, setCost] = usePersistentState('margin.cost', '')
  const [price, setPrice] = usePersistentState('margin.price', '')
  const [discount, setDiscount] = usePersistentState('margin.discount', '')
  const [target, setTarget] = usePersistentState('margin.target', '')
  const c = num(cost)
  const p = num(price)
  const d = num(discount) || 0
  const sale = p * (1 - d / 100)
  const margin = ((p - c) / p) * 100
  const targetPrice = c / (1 - num(target) / 100)
  return (
    <ToolLayout
      inputs={
        <>
          <FieldRow>
            <Field won label="원가" value={cost} onChange={setCost} placeholder="7,000" />
            <Field won label="판매가" value={price} onChange={setPrice} placeholder="10,000" />
          </FieldRow>
          <FieldRow>
            <Field label="할인율 (선택)" value={discount} onChange={setDiscount} suffix="%" placeholder="10" />
            <Field label="목표 마진율 (선택)" value={target} onChange={setTarget} suffix="%" placeholder="40" hint="이 마진을 남기는 판매가" />
          </FieldRow>
          <Note>마진율은 판매가 대비 이익, 마크업은 원가 대비 이익입니다.</Note>
        </>
      }
      readout={
        <Readout label="마진율" value={pct(margin)} sub={Number.isFinite(p - c) ? `개당 이익 ${wonText(p - c)}` : undefined} emptyHint="원가와 판매가를 입력하세요">
          <Stat label="마크업" value={pct(((p - c) / c) * 100)} />
          {d > 0 && <Stat label={`${fmt(d, 1)}% 할인가`} value={wonText(sale)} />}
          {d > 0 && <Stat label="할인 후 마진율" value={pct(((sale - c) / sale) * 100)} />}
          <Stat label="목표 마진 판매가" value={Number.isFinite(targetPrice) && targetPrice > 0 ? wonText(targetPrice) : EMPTY} strong />
        </Readout>
      }
    />
  )
}

export function BreakEvenTool(): JSX.Element {
  const [fixed, setFixed] = usePersistentState('breakeven.fixed', '')
  const [price, setPrice] = usePersistentState('breakeven.price', '')
  const [variable, setVariable] = usePersistentState('breakeven.variable', '')
  const [expected, setExpected] = usePersistentState('breakeven.expected', '')
  const f = num(fixed)
  const p = num(price)
  const v = num(variable)
  const units = Number.isFinite(f + p + v) ? breakEvenUnits(f, p, v) : NaN
  const q = num(expected)
  const profit = (p - v) * q - f
  const unitsText = units === null || !Number.isFinite(units) ? EMPTY : fmt(Math.ceil(units))
  return (
    <ToolLayout
      inputs={
        <>
          <Field won label="고정비 (월)" value={fixed} onChange={setFixed} placeholder="5,000,000" hint="임대료, 인건비처럼 판매량과 무관한 비용" />
          <FieldRow>
            <Field won label="판매 단가" value={price} onChange={setPrice} placeholder="25,000" />
            <Field won label="단위 변동비" value={variable} onChange={setVariable} placeholder="10,000" />
          </FieldRow>
          <Field label="예상 판매량 (선택)" value={expected} onChange={setExpected} suffix="개" placeholder="500" />
        </>
      }
      readout={
        <Readout
          label="손익분기 판매량"
          value={unitsText}
          unit="개"
          sub={units === null ? '단가가 변동비보다 커야 이익이 납니다' : unitsText !== EMPTY ? `매출 ${koreanWon(Math.ceil(units as number) * p)}` : undefined}
          emptyHint="고정비, 단가, 변동비를 입력하세요"
        >
          <Stat label="개당 공헌이익" value={wonText(p - v)} />
          <Stat label="공헌이익률" value={pct(((p - v) / p) * 100)} />
          {Number.isFinite(q) && <Stat label={`${fmt(q)}개 판매 시 영업이익`} value={wonText(profit)} strong />}
          {Number.isFinite(q) && typeof units === 'number' && Number.isFinite(units) && <Stat label="안전한계율" value={pct(((q - units) / q) * 100)} />}
        </Readout>
      }
    />
  )
}

export function LoanTool(): JSX.Element {
  const [amount, setAmount] = usePersistentState('loan.amount', '')
  const [rate, setRate] = usePersistentState('loan.rate', '')
  const [years, setYears] = usePersistentState('loan.years', '')
  const [method, setMethod] = usePersistentState<RepayMethod>('loan.method', 'annuity')
  const rows = useMemo(() => {
    const a = num(amount)
    const m = Math.round(num(years) * 12)
    return Number.isFinite(a) && Number.isFinite(num(rate)) && m >= 1 && m <= 600 ? loanSchedule(a, num(rate), m, method) : []
  }, [amount, rate, years, method])
  const interest = rows.reduce((s, r) => s + r.interest, 0)
  const principal = num(amount)
  return (
    <ToolLayout
      inputs={
        <>
          <Segmented label="상환 방식" value={method} onChange={setMethod} options={[['annuity', '원리금균등'], ['equal-principal', '원금균등'], ['bullet', '만기일시']]} />
          <Field won label="대출 금액" value={amount} onChange={setAmount} placeholder="100,000,000" />
          <FieldRow>
            <Field label="연 이율" value={rate} onChange={setRate} suffix="%" placeholder="4.5" />
            <Field label="기간" value={years} onChange={setYears} suffix="년" placeholder="5" />
          </FieldRow>
          {rows.length > 0 && <Schedule rows={rows} />}
        </>
      }
      readout={
        <Readout
          label={method === 'annuity' ? '월 상환액' : '첫 달 상환액'}
          value={rows.length ? won(rows[0].payment) : EMPTY}
          unit="원"
          sub={rows.length > 1 && method !== 'annuity' ? `마지막 달 ${wonText(rows[rows.length - 1].payment)}` : rows.length ? koreanWon(rows[0].payment) : undefined}
          emptyHint="금액, 이율, 기간을 입력하세요"
        >
          <Stat label="총 이자" value={rows.length ? wonText(interest) : EMPTY} />
          <Stat label="총 상환액" value={rows.length ? wonText(principal + interest) : EMPTY} strong />
          {rows.length > 0 && <SplitBar parts={[{ label: '원금', value: principal, color: C_MAIN }, { label: '이자', value: interest, color: C_SOFT }]} />}
        </Readout>
      }
    />
  )
}

function Schedule({ rows }: { rows: ReturnType<typeof loanSchedule> }): JSX.Element {
  // Yearly totals keep the table readable for long loans.
  const years = Array.from({ length: Math.ceil(rows.length / 12) }, (_, y) => {
    const slice = rows.slice(y * 12, y * 12 + 12)
    return { year: y + 1, principal: slice.reduce((s, r) => s + r.principal, 0), interest: slice.reduce((s, r) => s + r.interest, 0), balance: slice[slice.length - 1].balance }
  })
  return (
    <details className="group rounded-xl border border-border">
      <summary className="cursor-pointer select-none px-3.5 py-2.5 text-[13px] font-medium text-muted-foreground hover:text-foreground">연도별 상환 일정</summary>
      <div className="max-h-64 overflow-y-auto border-t border-border">
        <table className="w-full text-right text-[12px] tabular-nums">
          <thead className="sticky top-0 bg-background/95 text-muted-foreground">
            <tr>
              <th className="px-3.5 py-1.5 text-left font-medium">연차</th>
              <th className="px-3.5 py-1.5 font-medium">원금</th>
              <th className="px-3.5 py-1.5 font-medium">이자</th>
              <th className="px-3.5 py-1.5 font-medium">잔액</th>
            </tr>
          </thead>
          <tbody>
            {years.map((y) => (
              <tr key={y.year} className="border-t border-border/60">
                <td className="px-3.5 py-1.5 text-left">{y.year}년</td>
                <td className="px-3.5 py-1.5">{won(y.principal)}</td>
                <td className="px-3.5 py-1.5">{won(y.interest)}</td>
                <td className="px-3.5 py-1.5">{won(y.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

export function InvestTool(): JSX.Element {
  const [mode, setMode] = usePersistentState<'fv' | 'cagr'>('invest.mode', 'fv')
  const [principal, setPrincipal] = usePersistentState('invest.principal', '')
  const [monthly, setMonthly] = usePersistentState('invest.monthly', '')
  const [rate, setRate] = usePersistentState('invest.rate', '')
  const [years, setYears] = usePersistentState('invest.years', '')
  const [start, setStart] = usePersistentState('invest.start', '')
  const [end, setEnd] = usePersistentState('invest.end', '')
  const [cYears, setCYears] = usePersistentState('invest.cyears', '')
  const hasMoney = Number.isFinite(num(principal)) || Number.isFinite(num(monthly))
  const fv = hasMoney ? futureValue(num(principal) || 0, num(monthly) || 0, num(rate), num(years)) : NaN
  const paid = (num(principal) || 0) + (num(monthly) || 0) * Math.round(num(years) * 12)
  const growth = cagr(num(start), num(end), num(cYears))
  return (
    <ToolLayout
      inputs={
        <>
          <Segmented label="계산" value={mode} onChange={setMode} options={[['fv', '적립식 복리'], ['cagr', '연평균 성장률']]} />
          {mode === 'fv' ? (
            <>
              <FieldRow>
                <Field won label="초기 금액" value={principal} onChange={setPrincipal} placeholder="10,000,000" />
                <Field won label="월 적립" value={monthly} onChange={setMonthly} placeholder="500,000" />
              </FieldRow>
              <FieldRow>
                <Field label="연 수익률" value={rate} onChange={setRate} suffix="%" placeholder="6" />
                <Field label="기간" value={years} onChange={setYears} suffix="년" placeholder="10" />
              </FieldRow>
              <Note>월복리 기준이며 세금과 수수료는 빼지 않았습니다.</Note>
            </>
          ) : (
            <>
              <FieldRow>
                <Field label="시작 값" value={start} onChange={setStart} placeholder="100" hint="매출, 사용자 수 등" />
                <Field label="끝 값" value={end} onChange={setEnd} placeholder="180" />
              </FieldRow>
              <Field label="기간" value={cYears} onChange={setCYears} suffix="년" placeholder="5" />
            </>
          )}
        </>
      }
      readout={
        mode === 'fv' ? (
          <Readout label={Number.isFinite(num(years)) ? `${fmt(num(years), 1)}년 뒤 평가액` : '평가액'} value={won(fv)} unit="원" sub={Number.isFinite(fv) ? koreanWon(fv) : undefined}>
            <Stat label="납입 원금" value={Number.isFinite(fv) ? wonText(paid) : EMPTY} />
            <Stat label="수익" value={Number.isFinite(fv) ? wonText(fv - paid) : EMPTY} strong />
            {Number.isFinite(fv) && <SplitBar parts={[{ label: '원금', value: paid, color: C_SOFT }, { label: '수익', value: fv - paid, color: C_MAIN }]} />}
          </Readout>
        ) : (
          <Readout label="연평균 성장률 (CAGR)" value={pct(growth, 2)} sub={Number.isFinite(growth) ? `기간 전체 ${fmt((num(end) / num(start) - 1) * 100, 1)}% 성장` : undefined} />
        )
      }
    />
  )
}

export function NpvTool(): JSX.Element {
  const [rate, setRate] = usePersistentState('npv.rate', '')
  const [flows, setFlows] = usePersistentState<string[]>('npv.flows', ['', '', ''])
  const values = flows.map(num)
  const valid = values.every(Number.isFinite) && values.length >= 2 && Number.isFinite(num(rate))
  const value = valid ? npv(num(rate), values) : NaN
  const r = values.every(Number.isFinite) && values.length >= 2 ? irr(values) : null
  // Payback: first year the cumulative cash flow turns non-negative.
  let cum = 0
  const payback = valid ? values.findIndex((v) => (cum += v) >= 0) : -1
  const setAt = (i: number, v: string): void => setFlows(flows.map((f, j) => (j === i ? v : f)))
  return (
    <ToolLayout
      inputs={
        <>
          <Field label="할인율 (요구수익률)" value={rate} onChange={setRate} suffix="%" placeholder="8" />
          <div className="flex flex-col gap-2">
            <span className="text-[12px] font-medium text-muted-foreground">연도별 현금흐름 (투자 금액은 음수로)</span>
            {flows.map((f, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-12 shrink-0 text-[12px] tabular-nums text-muted-foreground">{i === 0 ? '투자' : `${i}년차`}</span>
                <NumInput value={f} onChange={(v) => setAt(i, v)} aria-label={`${i}년 현금흐름`} placeholder={i === 0 ? '-10,000,000' : '3,000,000'} className="field h-9 flex-1 rounded-lg tabular-nums placeholder:text-muted-foreground/40" />
                <RemoveButton disabled={flows.length <= 2} onClick={() => setFlows(flows.filter((_, j) => j !== i))} />
              </div>
            ))}
            <AddButton label="연도 추가" onClick={() => setFlows([...flows, ''])} />
          </div>
        </>
      }
      readout={
        <Readout
          label="순현재가치 (NPV)"
          value={won(value)}
          unit="원"
          sub={Number.isFinite(value) ? (value >= 0 ? '요구수익률을 넘는 투자입니다' : '요구수익률에 못 미칩니다') : undefined}
          emptyHint="할인율과 연도별 현금흐름을 입력하세요"
        >
          <Stat label="내부수익률 (IRR)" value={r === null ? EMPTY : pct(r, 2)} strong />
          <Stat label="회수 시점" value={!valid ? EMPTY : payback > 0 ? `${payback}년차` : payback === 0 ? '즉시' : '기간 내 미회수'} />
        </Readout>
      }
    />
  )
}

export function UnitEconomicsTool(): JSX.Element {
  const [arpu, setArpu] = usePersistentState('unit-economics.arpu', '')
  const [gross, setGross] = usePersistentState('unit-economics.gross', '')
  const [churn, setChurn] = usePersistentState('unit-economics.churn', '')
  const [cac, setCac] = usePersistentState('unit-economics.cac', '')
  const monthlyGross = num(arpu) * ((Number.isFinite(num(gross)) ? num(gross) : 100) / 100)
  const lifetime = 100 / num(churn)
  const ltv = monthlyGross * lifetime
  const ratio = ltv / num(cac)
  const payback = num(cac) / monthlyGross
  const health = !Number.isFinite(ratio) ? undefined : ratio >= 3 ? '건강한 수준 (3배 이상)' : ratio >= 1 ? '개선이 필요한 수준 (3배 미만)' : '고객 1명마다 손해를 보는 구조'
  return (
    <ToolLayout
      inputs={
        <>
          <FieldRow>
            <Field won label="고객당 월 매출 (ARPU)" value={arpu} onChange={setArpu} placeholder="30,000" />
            <Field label="매출총이익률" value={gross} onChange={setGross} suffix="%" placeholder="70" hint="비우면 100%" />
          </FieldRow>
          <FieldRow>
            <Field label="월 이탈률" value={churn} onChange={setChurn} suffix="%" placeholder="4" />
            <Field won label="고객 획득 비용 (CAC)" value={cac} onChange={setCac} placeholder="150,000" />
          </FieldRow>
          <Note>LTV = 월 매출총이익 ÷ 월 이탈률. LTV:CAC 3배 이상, 회수 기간 12개월 이내면 일반적으로 건강하다고 봅니다.</Note>
        </>
      }
      readout={
        <Readout label="LTV : CAC" value={Number.isFinite(ratio) ? fmt(ratio, 1) : EMPTY} unit="배" sub={health}>
          <Stat label="고객 생애가치 (LTV)" value={wonText(ltv)} strong />
          <Stat label="평균 유지 기간" value={Number.isFinite(lifetime) ? `${fmt(lifetime, 1)}개월` : EMPTY} />
          <Stat label="CAC 회수 기간" value={Number.isFinite(payback) ? `${fmt(payback, 1)}개월` : EMPTY} />
        </Readout>
      }
    />
  )
}

type PayBasis = 'hour' | 'month' | 'year'

export function SalaryTool(): JSX.Element {
  const [basis, setBasis] = usePersistentState<PayBasis>('salary.basis', 'year')
  const [amount, setAmount] = usePersistentState('salary.amount', '')
  const [weekly, setWeekly] = usePersistentState('salary.weekly', '40')
  const hours = monthlyHours(num(weekly) || 0)
  const a = num(amount)
  const monthly = basis === 'hour' ? a * hours : basis === 'month' ? a : a / 12
  const hourly = monthly / hours
  return (
    <ToolLayout
      inputs={
        <>
          <Segmented label="입력 기준" value={basis} onChange={setBasis} options={[['hour', '시급'], ['month', '월급'], ['year', '연봉']]} />
          <Field won label={basis === 'hour' ? '시급' : basis === 'month' ? '월급' : '연봉'} value={amount} onChange={setAmount} placeholder={basis === 'hour' ? '10,320' : basis === 'month' ? '3,500,000' : '42,000,000'} />
          <Field label="주 소정근로시간" value={weekly} onChange={setWeekly} suffix="시간" hint={`주휴 포함 월 ${fmt(hours)}시간으로 환산`} />
          <Note>세전 금액 기준입니다. 4대보험과 소득세는 반영하지 않습니다.</Note>
        </>
      }
      readout={
        <Readout label="월 환산액" value={won(monthly)} unit="원" sub={Number.isFinite(monthly) ? koreanWon(monthly) : undefined}>
          <Stat label="시급" value={wonText(hourly)} />
          <Stat label="일급 (8시간)" value={wonText(hourly * 8)} />
          <Stat label="연봉" value={wonText(monthly * 12)} strong />
        </Readout>
      }
    />
  )
}
