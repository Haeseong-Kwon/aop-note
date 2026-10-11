import { fmt, num } from '@/lib/toolMath'
import { AddButton, EMPTY, Field, FieldRow, Note, Plate, Readout, RemoveButton, RowHeader, RowInput, Stat, ToolLayout, newRowId, usePersistentState } from './ui'

const pct = (n: number, d = 2): string => (Number.isFinite(n) ? `${fmt(n, d)}%` : EMPTY)
const wonText = (n: number): string => (Number.isFinite(n) ? `${fmt(Math.round(n))}원` : EMPTY)

export function AdMetricsTool(): JSX.Element {
  const [spend, setSpend] = usePersistentState('ad-metrics.spend', '')
  const [impressions, setImpressions] = usePersistentState('ad-metrics.impressions', '')
  const [clicks, setClicks] = usePersistentState('ad-metrics.clicks', '')
  const [conversions, setConversions] = usePersistentState('ad-metrics.conversions', '')
  const [revenue, setRevenue] = usePersistentState('ad-metrics.revenue', '')
  const s = num(spend)
  const imp = num(impressions)
  const c = num(clicks)
  const conv = num(conversions)
  const rev = num(revenue)
  const roas = (rev / s) * 100
  return (
    <ToolLayout
      inputs={
        <>
          <Field won label="광고비" value={spend} onChange={setSpend} placeholder="1,000,000" />
          <FieldRow>
            <Field label="노출 수" value={impressions} onChange={setImpressions} suffix="회" placeholder="200,000" />
            <Field label="클릭 수" value={clicks} onChange={setClicks} suffix="회" placeholder="3,000" />
          </FieldRow>
          <FieldRow>
            <Field label="전환 수" value={conversions} onChange={setConversions} suffix="건" placeholder="90" hint="구매, 가입, 문의 등" />
            <Field won label="전환 매출" value={revenue} onChange={setRevenue} placeholder="4,500,000" />
          </FieldRow>
          <Note>아는 값만 넣어도 계산할 수 있는 지표부터 보여 줍니다. 손익분기 ROAS는 마진율의 역수입니다(마진 25%면 400%).</Note>
        </>
      }
      readout={
        <Readout label="ROAS (광고 수익률)" value={Number.isFinite(roas) ? `${fmt(roas, 0)}%` : EMPTY} sub={Number.isFinite(roas) ? `광고비 1원당 매출 ${fmt(rev / s, 2)}원` : undefined} emptyHint="광고비와 전환 매출을 넣으면 ROAS를 계산합니다">
          <Stat label="CTR (클릭률)" value={pct((c / imp) * 100)} />
          <Stat label="CVR (전환율)" value={pct((conv / c) * 100)} />
          <Stat label="CPM (노출 1천 회당)" value={wonText((s / imp) * 1000)} />
          <Stat label="CPC (클릭당)" value={wonText(s / c)} />
          <Stat label="CPA (전환당)" value={wonText(s / conv)} strong />
          <Stat label="객단가" value={wonText(rev / conv)} />
        </Readout>
      }
    />
  )
}

interface Stage {
  id: string
  name: string
  count: string
}

export function FunnelTool(): JSX.Element {
  const [stages, setStages] = usePersistentState<Stage[]>('funnel.stages', [
    { id: 's1', name: '', count: '' },
    { id: 's2', name: '', count: '' },
    { id: 's3', name: '', count: '' }
  ])
  const PLACEHOLDERS = ['방문', '회원가입', '첫 구매', '재구매']
  const set = (id: string, patch: Partial<Stage>): void => setStages(stages.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  const counts = stages.map((s) => num(s.count))
  const top = counts[0]
  const filled = counts.filter(Number.isFinite).length
  const last = [...counts].reverse().find(Number.isFinite) ?? NaN
  // The step with the lowest conversion is where to look first.
  const steps = counts.map((c, i) => (i === 0 ? NaN : c / counts[i - 1]))
  const worst = steps.reduce((w, r, i) => (Number.isFinite(r) && (w < 0 || r < steps[w]) ? i : w), -1)
  return (
    <ToolLayout
      wide
      inputs={
        <>
          <div className="flex flex-col gap-1.5">
            <RowHeader name="단계" cols={[{ label: '인원/건수' }]} />
            {stages.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2">
                <RowInput wide label="단계 이름" placeholder={`예: ${PLACEHOLDERS[i] ?? '다음 단계'}`} value={s.name} onChange={(v) => set(s.id, { name: v })} />
                <RowInput label="인원" placeholder="0" value={s.count} onChange={(v) => set(s.id, { count: v })} />
                <RemoveButton disabled={stages.length <= 2} onClick={() => setStages(stages.filter((x) => x.id !== s.id))} />
              </div>
            ))}
            <AddButton label="단계 추가" onClick={() => setStages([...stages, { id: newRowId(), name: '', count: '' }])} />
          </div>
          <Note>위에서 아래로 좁아지는 순서대로 입력하세요. 전환율이 가장 낮은 단계를 표시합니다.</Note>
        </>
      }
      readout={
        filled < 2 ? (
          <Readout label="전체 전환율" value={EMPTY} emptyHint="두 단계 이상의 인원을 입력하세요" />
        ) : (
          <Plate label={`전체 전환율 ${pct((last / top) * 100)}`}>
            <ol className="space-y-2.5">
              {stages.map((s, i) => {
                const c = counts[i]
                const width = Number.isFinite(c) && top > 0 ? Math.max(4, (c / top) * 100) : 0
                return (
                  <li key={s.id}>
                    <div className="flex items-baseline justify-between text-[12.5px]">
                      <span className="font-medium">{s.name || PLACEHOLDERS[i] || `${i + 1}단계`}</span>
                      <span className="tabular-nums text-muted-foreground">{Number.isFinite(c) ? fmt(c) : EMPTY}</span>
                    </div>
                    <div className="mt-1 flex justify-center">
                      <span className="block h-6 rounded-md bg-[color:var(--tool)] transition-[width] duration-slow" style={{ width: `${width}%`, opacity: 1 - i * 0.14 }} />
                    </div>
                    {i > 0 && Number.isFinite(steps[i]) && (
                      <p className={`mt-0.5 text-center text-[11.5px] tabular-nums ${i === worst ? 'font-semibold text-rose-600 dark:text-rose-400' : 'text-muted-foreground'}`}>
                        ↓ 이전 단계의 {pct(steps[i] * 100, 1)}
                        {i === worst && ' · 가장 많이 빠지는 구간'}
                      </p>
                    )}
                  </li>
                )
              })}
            </ol>
          </Plate>
        )
      }
    />
  )
}
