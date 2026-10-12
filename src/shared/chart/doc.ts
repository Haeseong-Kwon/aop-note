// The 통계·그래프 document model and grid helpers shared by the kinds. A chart lives in a memo as one ChartDoc (its whole state:
// kind, title, data grid, options); everything shown — picture, figures, one-line
// reading — is recomputed from it, so the memo block, the tool page and the exporters
// can never drift apart.
import * as S from './stats'
import * as V from './svg'

export type ChartKind =
  | 'bar' | 'line' | 'pie' | 'scatter' | 'histogram' | 'box' | 'pareto' | 'waterfall' | 'radar' | 'heatmap' | 'bullet' | 'treemap' | 'dumbbell'
  | 'describe' | 'corr' | 'ttest' | 'anova' | 'abtest' | 'chisq' | 'forecast' | 'samplesize' | 'normal'

export interface ChartDoc {
  v: 1
  kind: ChartKind
  title: string
  /** Free-text caption shown under the chart. */
  note: string
  /** Row 0 is the header; with a label column, column 0 holds the row labels. */
  grid: string[][]
  opts: Record<string, string>
}

export interface StatLine {
  label: string
  value: string
  strong?: boolean
}

export interface Report {
  /** '' when there isn't enough data yet (then `empty` says what's missing). */
  svg: string
  stats: StatLine[]
  insight: string
  table?: { head: string[]; rows: string[][] }
  empty?: string
}

export interface OptionDef {
  key: string
  label: string
  default: string
  choices?: readonly (readonly [string, string])[]
  /** A free-text field (otherwise a number field) when there are no choices. */
  text?: boolean
  suffix?: string
  placeholder?: string
}

export interface GridShape {
  head: string[]
  rows: number
  /** Column 0 holds row labels (categories) rather than data. */
  labelCol: boolean
  growCols: boolean
  growRows: boolean
  maxCols?: number
  rowLabels?: string[]
  /** What each column means, shown under the header ('항목', 'X', '계열'…); the last repeats. */
  roles?: string[]
  hint: string
}

export interface KindDef {
  kind: ChartKind
  section: 'graph' | 'stats'
  name: string
  blurb: string
  grid?: GridShape
  options: OptionDef[]
  sample: Pick<ChartDoc, 'title' | 'grid'> & { opts?: Record<string, string> }
  compute: (doc: ChartDoc, th: V.Theme) => Report
}

// --- Reading the grid ---------------------------------------------------------------

export const filled = (r: string[]): boolean => r.some((c) => c.trim() !== '')

/** Categories + numeric series (columns 1…) from a labelled grid. */
export function labeled(doc: ChartDoc): { cats: string[]; series: V.Series[] } {
  const head = doc.grid[0] ?? []
  const rows = doc.grid.slice(1).filter(filled)
  const cols = head.map((_, j) => j).filter((j) => j > 0 && (head[j]?.trim() || rows.some((r) => r[j]?.trim())))
  return {
    cats: rows.map((r, i) => r[0]?.trim() || `${i + 1}`),
    series: cols.map((j, k) => ({ name: head[j]?.trim() || `계열 ${k + 1}`, values: rows.map((r) => S.parseNum(r[j])) }))
  }
}

/** Every column as a sample of numbers (grids without a label column). */
export function samples(doc: ChartDoc): { name: string; values: number[] }[] {
  const head = doc.grid[0] ?? []
  const rows = doc.grid.slice(1)
  return head
    .map((h, j) => ({ name: h.trim() || `데이터 ${j + 1}`, values: S.finite(rows.map((r) => S.parseNum(r[j]))) }))
    .filter((c) => c.values.length > 0)
}

/** Label/value pairs from the first numeric column. */
export function items(doc: ChartDoc): { name: string; value: number }[] {
  const { cats, series } = labeled(doc)
  const vals = series[0]?.values ?? []
  return cats.map((name, i) => ({ name, value: vals[i] })).filter((i) => Number.isFinite(i.value))
}

export const none = (empty: string): Report => ({ svg: '', stats: [], insight: '', empty })
export const unit = (doc: ChartDoc): string => doc.opts.unit?.trim() ?? ''
export const num = (doc: ChartDoc, key: string): number => S.parseNum(doc.opts[key])
export const fmtP = (p: number): string => (!Number.isFinite(p) ? '—' : p < 0.001 ? '< 0.001' : V.fmt(p, 3))
export const pct = (x: number, d = 1): string => `${V.fmt(x * 100, d)}%`
export const signed = (x: number, d = 2): string => `${x > 0 ? '+' : x < 0 ? '−' : ''}${V.fmt(Math.abs(x), d)}`
export const alpha = (doc: ChartDoc): number => Number(doc.opts.alpha) || 0.05

export function strength(r: number): string {
  const a = Math.abs(r)
  const word = a < 0.1 ? '거의 없는' : a < 0.3 ? '약한' : a < 0.5 ? '중간 정도의' : a < 0.7 ? '강한' : '매우 강한'
  return a < 0.1 ? '상관이 거의 없습니다' : `${word} ${r > 0 ? '양(+)의' : '음(−)의'} 상관이 있습니다`
}

/** "p = 0.012" / "p < 0.001". */
export const pText = (p: number): string => (p < 0.001 ? 'p < 0.001' : `p = ${fmtP(p)}`)
export const verdict = (p: number, a: number, yes: string, no: string): string => (p < a ? `${pText(p)} (기준 ${a}) → ${yes}` : `${pText(p)} ≥ ${a} → ${no}`)

export const UNIT: OptionDef = { key: 'unit', label: '단위', default: '', placeholder: '원, 건, % …', text: true }
export const ALPHA: OptionDef = { key: 'alpha', label: '유의수준', default: '0.05', choices: [['0.1', '10%'], ['0.05', '5%'], ['0.01', '1%']] }

