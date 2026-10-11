import { Plus, X } from 'lucide-react'
import { fmt, num, pert, rice } from '@/lib/toolMath'
import { AddButton, EMPTY, Note, NumInput, Plate, Readout, RemoveButton, RowHeader, RowInput, Stat, ToolLayout, newRowId, usePersistentState } from './ui'

const finite = (n: number): boolean => Number.isFinite(n)

interface PertRow {
  id: string
  name: string
  o: string
  m: string
  p: string
}
const blankPert = (): PertRow => ({ id: newRowId(), name: '', o: '', m: '', p: '' })

export function PertTool(): JSX.Element {
  const [rows, setRows] = usePersistentState<PertRow[]>('pert.rows', [{ id: 'r1', name: '', o: '', m: '', p: '' }])
  const set = (id: string, patch: Partial<PertRow>): void => setRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const est = rows.map((r) => pert(num(r.o), num(r.m), num(r.p)))
  const done = est.filter((e) => finite(e.expected))
  const total = done.reduce((s, e) => s + e.expected, 0)
  const sd = Math.sqrt(done.reduce((s, e) => s + e.sd ** 2, 0))
  const has = done.length > 0
  return (
    <ToolLayout
      wide
      inputs={
        <>
          <div className="flex flex-col gap-1.5">
            <RowHeader name="작업" cols={[{ label: '낙관' }, { label: '보통' }, { label: '비관' }]} />
            {rows.map((r, i) => (
              <div key={r.id} className="flex items-center gap-2">
                <RowInput wide label="작업 이름" placeholder={i === 0 ? '예: 시안 디자인' : '작업 이름'} value={r.name} onChange={(v) => set(r.id, { name: v })} />
                <RowInput label="낙관" placeholder="2" value={r.o} onChange={(v) => set(r.id, { o: v })} />
                <RowInput label="보통" placeholder="3" value={r.m} onChange={(v) => set(r.id, { m: v })} />
                <RowInput label="비관" placeholder="6" value={r.p} onChange={(v) => set(r.id, { p: v })} />
                <RemoveButton disabled={rows.length <= 1} onClick={() => setRows(rows.filter((x) => x.id !== r.id))} />
              </div>
            ))}
            <AddButton label="작업 추가" onClick={() => setRows([...rows, blankPert()])} />
          </div>
          <Note>단위는 일·주·시간 중 하나로 통일하세요. 기대값 = (낙관 + 4 × 보통 + 비관) ÷ 6이며, 작업이 순서대로 이어진다고 보고 합산합니다.</Note>
        </>
      }
      readout={
        <Readout label="기대 소요" value={has ? fmt(total, 1) : EMPTY} unit="일" sub={has ? `표준편차 ±${fmt(sd, 1)}` : undefined} emptyHint="작업마다 낙관·보통·비관 기간을 입력하세요">
          <Stat label="68% 확률로 완료" value={has ? `${fmt(total + sd, 1)}일 이내` : EMPTY} />
          <Stat label="95% 확률로 완료" value={has ? `${fmt(total + 2 * sd, 1)}일 이내` : EMPTY} strong />
          {done.length > 1 && (
            <div className="mt-3 space-y-1.5">
              {rows.map((r, i) =>
                finite(est[i].expected) ? (
                  <div key={r.id} className="flex items-center gap-2 text-[12px]">
                    <span className="w-20 truncate text-muted-foreground">{r.name || `작업 ${i + 1}`}</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <span className="block h-full rounded-full bg-[color:var(--tool)] transition-[width] duration-slow" style={{ width: `${total > 0 ? Math.max(0, (est[i].expected / total) * 100) : 0}%` }} />
                    </span>
                    <span className="w-10 text-right tabular-nums">{fmt(est[i].expected, 1)}</span>
                  </div>
                ) : null
              )}
            </div>
          )}
        </Readout>
      }
    />
  )
}

interface RiceRow {
  id: string
  name: string
  reach: string
  impact: string
  confidence: string
  effort: string
}

const IMPACT_HINT = '3 매우 큼 · 2 큼 · 1 보통 · 0.5 작음 · 0.25 미미'
const blankRice = (): RiceRow => ({ id: newRowId(), name: '', reach: '', impact: '', confidence: '', effort: '' })

export function RiceTool(): JSX.Element {
  const [rows, setRows] = usePersistentState<RiceRow[]>('rice.rows', [{ id: 'r1', name: '', reach: '', impact: '', confidence: '', effort: '' }])
  const set = (id: string, patch: Partial<RiceRow>): void => setRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const scored = rows
    .map((r) => ({ ...r, score: rice(num(r.reach), num(r.impact), num(r.confidence), num(r.effort)) }))
    .filter((r) => finite(r.score) && r.score > 0)
    .sort((a, b) => b.score - a.score)
  const max = Math.max(...scored.map((r) => r.score), 1)
  return (
    <ToolLayout
      wide
      inputs={
        <>
          <div className="flex flex-col gap-1.5">
            <RowHeader
              name="항목"
              cols={[
                { label: '도달', title: '기간 내 영향받는 사용자 수' },
                { label: '영향', title: IMPACT_HINT },
                { label: '확신 %', title: '추정에 대한 확신' },
                { label: '노력', title: '인월(person-month)' }
              ]}
            />
            {rows.map((r, i) => (
              <div key={r.id} className="flex items-center gap-2">
                <RowInput wide label="항목 이름" placeholder={i === 0 ? '예: 온보딩 개선' : '항목 이름'} value={r.name} onChange={(v) => set(r.id, { name: v })} />
                <RowInput label="도달" placeholder="800" value={r.reach} onChange={(v) => set(r.id, { reach: v })} />
                <RowInput label="영향" placeholder="1" value={r.impact} onChange={(v) => set(r.id, { impact: v })} />
                <RowInput label="확신 %" placeholder="80" value={r.confidence} onChange={(v) => set(r.id, { confidence: v })} />
                <RowInput label="노력" placeholder="2" value={r.effort} onChange={(v) => set(r.id, { effort: v })} />
                <RemoveButton disabled={rows.length <= 1} onClick={() => setRows(rows.filter((x) => x.id !== r.id))} />
              </div>
            ))}
            <AddButton label="항목 추가" onClick={() => setRows([...rows, blankRice()])} />
          </div>
          <Note>RICE = 도달 × 영향 × 확신 ÷ 노력. 영향: {IMPACT_HINT}.</Note>
        </>
      }
      readout={
        <Readout label="1순위" value={scored[0] ? scored[0].name || '이름 없는 항목' : EMPTY} sub={scored[0] ? `RICE 점수 ${fmt(scored[0].score, 1)}` : undefined} emptyHint="항목의 네 가지 값을 입력하면 순위를 매깁니다">
          {scored.length > 0 && (
            <ol className="space-y-1.5">
              {scored.map((r, i) => (
                <li key={r.id} className="flex items-center gap-2 text-[12px]">
                  <span className="w-4 tabular-nums text-muted-foreground">{i + 1}</span>
                  <span className="w-24 truncate">{r.name || '이름 없음'}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full rounded-full bg-[color:var(--tool)] transition-[width] duration-slow" style={{ width: `${(r.score / max) * 100}%`, opacity: Math.max(0.35, 1 - i * 0.12) }} />
                  </span>
                  <span className="w-12 text-right tabular-nums">{fmt(r.score, 1)}</span>
                </li>
              ))}
            </ol>
          )}
        </Readout>
      }
    />
  )
}

interface Matrix {
  criteria: { id: string; name: string; weight: string }[]
  options: { id: string; name: string; scores: Record<string, string> }[]
}

const BLANK_MATRIX: Matrix = {
  criteria: [
    { id: 'c1', name: '', weight: '' },
    { id: 'c2', name: '', weight: '' }
  ],
  options: [
    { id: 'o1', name: '', scores: {} },
    { id: 'o2', name: '', scores: {} }
  ]
}
const CRITERIA_EXAMPLES = ['비용', '품질', '일정', '위험']
const OPTION_EXAMPLES = ['업체 A', '업체 B', '자체 개발']

export function DecisionMatrixTool(): JSX.Element {
  const [m, setM] = usePersistentState<Matrix>('decision.matrix', BLANK_MATRIX)
  // Empty weight = equal weight (1), so scores alone already rank the options.
  const weight = (c: Matrix['criteria'][number]): number => (finite(num(c.weight)) ? num(c.weight) : 1)
  const totalWeight = m.criteria.reduce((s, c) => s + weight(c), 0)
  const ranked = m.options
    .map((o, i) => {
      const scored = m.criteria.filter((c) => finite(num(o.scores[c.id] ?? '')))
      return {
        ...o,
        label: o.name || `대안 ${i + 1}`,
        score: scored.length && totalWeight > 0 ? m.criteria.reduce((s, c) => s + (num(o.scores[c.id] ?? '') || 0) * weight(c), 0) / totalWeight : NaN
      }
    })
    .filter((o) => finite(o.score))
    .sort((a, b) => b.score - a.score)
  const setCriterion = (id: string, patch: Partial<Matrix['criteria'][number]>): void => setM({ ...m, criteria: m.criteria.map((c) => (c.id === id ? { ...c, ...patch } : c)) })
  const setOption = (id: string, patch: Partial<Matrix['options'][number]>): void => setM({ ...m, options: m.options.map((o) => (o.id === id ? { ...o, ...patch } : o)) })
  const cell = 'field h-9 w-full rounded-lg text-center tabular-nums placeholder:text-muted-foreground/40 focus:border-[color:var(--tool)]'
  return (
    <ToolLayout
      wide
      inputs={
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-1.5 text-[12px]">
              <thead>
                <tr>
                  <th className="w-32 text-left align-bottom font-medium text-muted-foreground">대안 \ 기준</th>
                  {m.criteria.map((c, i) => (
                    <th key={c.id} className="min-w-[6rem] font-normal">
                      <div className="flex items-center gap-0.5">
                        <input value={c.name} onChange={(e) => setCriterion(c.id, { name: e.target.value })} placeholder={CRITERIA_EXAMPLES[i] ?? '기준'} aria-label="기준 이름" className={`${cell} font-medium`} />
                        <button onClick={() => setM({ ...m, criteria: m.criteria.filter((x) => x.id !== c.id) })} disabled={m.criteria.length <= 1} aria-label="기준 삭제" className="text-muted-foreground/70 hover:text-foreground disabled:opacity-25">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="mt-1 flex items-center justify-center gap-1 pr-3.5 text-[11px] text-muted-foreground">
                        가중치
                        <NumInput value={c.weight} onChange={(v) => setCriterion(c.id, { weight: v })} placeholder="1" aria-label={`${c.name || '기준'} 가중치`} className="field h-7 w-12 rounded-md text-center tabular-nums placeholder:text-muted-foreground/40" />
                      </div>
                    </th>
                  ))}
                  <th className="align-top">
                    <button onClick={() => setM({ ...m, criteria: [...m.criteria, { id: newRowId(), name: '', weight: '' }] })} aria-label="기준 추가" className="flex h-9 w-9 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground hover:border-[color:var(--tool)] hover:text-[color:var(--tool)]">
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {m.options.map((o, i) => (
                  <tr key={o.id}>
                    <td>
                      <input value={o.name} onChange={(e) => setOption(o.id, { name: e.target.value })} placeholder={OPTION_EXAMPLES[i] ?? '대안'} aria-label="대안 이름" className={`${cell} text-left font-medium`} />
                    </td>
                    {m.criteria.map((c) => (
                      <td key={c.id} className="pr-3.5">
                        <NumInput value={o.scores[c.id] ?? ''} onChange={(v) => setOption(o.id, { scores: { ...o.scores, [c.id]: v } })} placeholder="1–5" aria-label={`${o.name || '대안'} ${c.name || '기준'} 점수`} className={cell} />
                      </td>
                    ))}
                    <td>
                      <RemoveButton disabled={m.options.length <= 1} onClick={() => setM({ ...m, options: m.options.filter((x) => x.id !== o.id) })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <AddButton label="대안 추가" onClick={() => setM({ ...m, options: [...m.options, { id: newRowId(), name: '', scores: {} }] })} />
          <Note>각 기준에 1–5점을 매기세요. 가중치는 비율로 계산하고, 비우면 모두 같게 봅니다.</Note>
        </>
      }
      readout={
        ranked.length === 0 ? (
          <Readout label="최선의 대안" value={EMPTY} emptyHint="대안마다 점수를 입력하세요" />
        ) : (
          <Plate label="최선의 대안">
            <p className="tool-figure">{ranked[0].label}</p>
            <p className="mt-1 text-[13px] text-muted-foreground">가중 평균 {fmt(ranked[0].score, 2)} / 5</p>
            <div className="mt-4 space-y-2 border-t border-dashed border-[color:var(--tool-line)] pt-3">
              {ranked.map((o, i) => (
                <div key={o.id} className="flex items-center gap-2 text-[12.5px]">
                  <span className="w-4 tabular-nums text-muted-foreground">{i + 1}</span>
                  <span className="w-24 truncate font-medium">{o.label}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full rounded-full bg-[color:var(--tool)] transition-[width] duration-slow" style={{ width: `${(o.score / 5) * 100}%`, opacity: i === 0 ? 1 : 0.45 }} />
                  </span>
                  <span className="w-10 text-right tabular-nums">{fmt(o.score, 2)}</span>
                </div>
              ))}
            </div>
          </Plate>
        )
      }
    />
  )
}
