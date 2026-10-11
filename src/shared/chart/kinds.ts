// The 통계·그래프 catalogue. A chart lives in a memo as one ChartDoc (its whole state:
// kind, title, data grid, options); everything shown — picture, figures, one-line
// reading — is recomputed from it, so the memo block, the tool page and the exporters
// can never drift apart.
import * as V from './svg'
import { none, type ChartDoc, type ChartKind, type KindDef, type Report } from './doc'
import { bar, line, pie, scatter, histogram, box, pareto, waterfall, radar, heatmap, bullet, treemap, dumbbell } from './graphKinds'
import { describe, corr, ttest, anova, abtest, chisq, forecast, samplesize, normal } from './statKinds'

export * from './doc'

export const KINDS: KindDef[] = [bar, line, pie, scatter, histogram, box, pareto, waterfall, radar, heatmap, bullet, treemap, dumbbell, describe, corr, ttest, anova, abtest, chisq, forecast, samplesize, normal]
export const kindDef = (k: string): KindDef | undefined => KINDS.find((d) => d.kind === k)

// --- Docs -------------------------------------------------------------------------------

export function emptyDoc(kind: ChartKind): ChartDoc {
  const def = kindDef(kind)!
  const g = def.grid
  const grid = g ? [[...g.head], ...Array.from({ length: g.rows }, (_, i) => g.head.map((_, j) => (j === 0 && g.rowLabels ? g.rowLabels[i] ?? '' : '')))] : []
  return { v: 1, kind, title: '', note: '', grid, opts: Object.fromEntries(def.options.map((o) => [o.key, o.default])) }
}

export function sampleDoc(kind: ChartKind): ChartDoc {
  const def = kindDef(kind)!
  const base = emptyDoc(kind)
  return { ...base, title: def.sample.title, grid: def.sample.grid.map((r) => [...r]), opts: { ...base.opts, ...def.sample.opts } }
}

const MAX_CELLS = 20_000

/** Validates untrusted JSON (memo props, pasted fences, synced devices) into a ChartDoc. */
export function parseChartDoc(raw: unknown): ChartDoc | null {
  let v: unknown = raw
  if (typeof raw === 'string') {
    try {
      v = JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (typeof o.kind !== 'string' || !kindDef(o.kind)) return null
  const grid = Array.isArray(o.grid) ? o.grid.filter(Array.isArray).map((r) => (r as unknown[]).map((c) => (typeof c === 'string' ? c : c == null ? '' : String(c)))) : []
  if (grid.reduce((n, r) => n + r.length, 0) > MAX_CELLS) return null
  const opts: Record<string, string> = {}
  if (o.opts && typeof o.opts === 'object') for (const [k, val] of Object.entries(o.opts as Record<string, unknown>)) if (typeof val === 'string') opts[k] = val
  return { v: 1, kind: o.kind as ChartKind, title: typeof o.title === 'string' ? o.title : '', note: typeof o.note === 'string' ? o.note : '', grid, opts: { ...emptyDoc(o.kind as ChartKind).opts, ...opts } }
}

/** Never throws: a bad grid shows a message instead of breaking the memo. */
export function computeReport(doc: ChartDoc, theme: V.ThemeName = 'light'): Report {
  const def = kindDef(doc.kind)
  if (!def) return none('알 수 없는 차트 종류입니다')
  try {
    return def.compute(doc, V.THEMES[theme])
  } catch (error) {
    return none(`계산할 수 없는 값이 있습니다 (${error instanceof Error ? error.message : String(error)})`)
  }
}

/** The fence a chart serialises to in the Markdown copy of a memo. */
export const CHART_FENCE = 'aop-chart'
