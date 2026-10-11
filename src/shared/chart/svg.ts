// Chart drawing as plain SVG strings, so the memo block, the tool page and the PDF/PPTX
// exporters (main process, no DOM) all show the same picture. Marks follow one spec:
// ≤24px bars with a 4px rounded data end, 2px lines, r4 markers with a 2px surface
// ring, hairline solid grid, a 2px surface gap between touching fills, text in ink
// tokens (never the series colour), a legend for 2+ series, <title> on every mark
// for the hover tooltip.
import { niceStep } from './stats'

export type ThemeName = 'light' | 'dark'

export interface Theme {
  surface: string
  ink: string
  ink2: string
  muted: string
  grid: string
  axis: string
  /** Categorical slots, fixed order — never cycled. */
  series: string[]
  /** Sequential blue, light → dark. */
  ramp: string[]
  pos: string
  neg: string
  mid: string
}

const RAMP = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b']

export const THEMES: Record<ThemeName, Theme> = {
  light: {
    surface: '#fcfcfb',
    ink: '#0b0b0b',
    ink2: '#52514e',
    muted: '#898781',
    grid: '#e1e0d9',
    axis: '#c3c2b7',
    series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
    ramp: RAMP,
    pos: '#2a78d6',
    neg: '#e34948',
    mid: '#f0efec'
  },
  dark: {
    surface: '#1a1a19',
    ink: '#f0efec',
    ink2: '#c3c2b7',
    muted: '#898781',
    grid: '#2c2c2a',
    axis: '#383835',
    series: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
    ramp: [...RAMP].reverse(),
    pos: '#3987e5',
    neg: '#e66767',
    mid: '#383835'
  }
}

export const MAX_SERIES = 8
export const W = 640
export const H = 360
const FONT = "Pretendard, -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Malgun Gothic', system-ui, sans-serif"
const BAR_MAX = 24
const R = 4 // data-end radius / marker radius
const GAP = 2
let clipSeq = 0 // unique clipPath ids when several charts share a page

// --- Text & numbers ---------------------------------------------------------------------

export const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Approximate rendered width (CJK glyphs are square, Latin ~0.58em). */
export const textWidth = (s: string, size: number): number => [...s].reduce((w, ch) => w + (/[ᄀ-ᇿ　-鿿가-힯]/.test(ch) ? size : /[\s.,:]/.test(ch) ? size * 0.32 : size * 0.6), 0)

export function clip(s: string, size: number, max: number): string {
  if (textWidth(s, size) <= max) return s
  let out = s
  while (out.length > 1 && textWidth(`${out}…`, size) > max) out = out.slice(0, -1)
  return `${out}…`
}

/** Grouped digits with up to `digits` decimals ("12,345.6"). */
export function fmt(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString('ko-KR', { maximumFractionDigits: digits })
}

/** Axis-friendly Korean compact form: 12,000 → 1.2만, 350,000,000 → 3.5억. */
export function compact(n: number): string {
  const a = Math.abs(n)
  if (a >= 1e12) return `${fmt(n / 1e12, 1)}조`
  if (a >= 1e8) return `${fmt(n / 1e8, 1)}억`
  if (a >= 1e4) return `${fmt(n / 1e4, 1)}만`
  return fmt(n, a < 10 ? 2 : 1)
}

const t = (x: number, y: number, s: string, fill: string, o: { size?: number; anchor?: 'start' | 'middle' | 'end'; weight?: number; base?: string } = {}): string =>
  `<text x="${r1(x)}" y="${r1(y)}" fill="${fill}" font-size="${o.size ?? 11}"${o.anchor && o.anchor !== 'start' ? ` text-anchor="${o.anchor}"` : ''}${o.weight ? ` font-weight="${o.weight}"` : ''} dominant-baseline="${o.base ?? 'middle'}">${esc(s)}</text>`
const r1 = (n: number): number => Math.round(n * 10) / 10
const tip = (s: string): string => `<title>${esc(s)}</title>`

export function svgDoc(body: string, th: Theme, h = H, background = false): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${h}" width="${W}" height="${h}" font-family="${esc(FONT)}" style="font-variant-numeric:tabular-nums">${background ? `<rect width="${W}" height="${h}" fill="${th.surface}"/>` : ''}${body}</svg>`
}

/** Linear scale with round ticks; `zero` keeps the baseline in view (bars). */
export function niceScale(lo: number, hi: number, count = 5, zero = false): { lo: number; hi: number; ticks: number[] } {
  let a = zero ? Math.min(0, lo) : lo
  let b = zero ? Math.max(0, hi) : hi
  if (!(b > a)) {
    a -= Math.abs(a) * 0.5 || 1
    b += Math.abs(b) * 0.5 || 1
  }
  const step = niceStep((b - a) / count)
  const s = Math.floor(a / step + 1e-9) * step
  const e = Math.ceil(b / step - 1e-9) * step
  const ticks: number[] = []
  for (let v = s; v <= e + step / 2; v += step) ticks.push(Number(v.toFixed(10)))
  return { lo: s, hi: e, ticks }
}

/** Legend row along the top: swatch (or line key) + name. Returns its height. */
function legend(items: { name: string; color: string; line?: boolean; dash?: boolean }[], th: Theme, x = 0, y = 10): string {
  let cx = x
  return items
    .map((it) => {
      const name = clip(it.name, 12.5, 150)
      const key = it.line
        ? `<line x1="${cx}" y1="${y}" x2="${cx + 14}" y2="${y}" stroke="${it.color}" stroke-width="2" stroke-linecap="round"${it.dash ? ' stroke-dasharray="4 3"' : ''}/>`
        : `<rect x="${cx + 2}" y="${y - 5}" width="10" height="10" rx="2.5" fill="${it.color}"/>`
      const out = key + t(cx + 19, y, name, th.ink2, { size: 12.5 })
      cx += 19 + textWidth(name, 12.5) + 16
      return out
    })
    .join('')
}

/** A bar with a rounded data end and a square baseline. */
function bar(x: number, y: number, w: number, h: number, end: 'top' | 'bottom' | 'left' | 'right', fill: string, title: string, round = true): string {
  if (w <= 0 || h <= 0) return ''
  const r = round ? Math.min(R, w / 2, h / 2) : 0
  let d: string
  if (end === 'top') d = `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
  else if (end === 'bottom') d = `M${x},${y}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w - r}Q${x + w},${y + h} ${x + w},${y + h - r}V${y}Z`
  else if (end === 'right') d = `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`
  else d = `M${x + w},${y}H${x + r}Q${x},${y} ${x},${y + r}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w}Z`
  return `<path d="${d.replace(/(\d+\.\d{2,})/g, (m) => String(r1(Number(m))))}" fill="${fill}">${tip(title)}</path>`
}

const dot = (x: number, y: number, fill: string, th: Theme, title: string, r = R): string =>
  `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r}" fill="${fill}" stroke="${th.surface}" stroke-width="2">${tip(title)}</circle>`

const linePath = (pts: [number, number][]): string => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${r1(x)},${r1(y)}`).join('')

// --- Frames -------------------------------------------------------------------------

interface Box {
  x0: number
  x1: number
  y0: number
  y1: number
}

/** Category bands along one axis, a value scale along the other, gridlines + tick labels. */
function bandFrame(cats: string[], lo: number, hi: number, th: Theme, o: { horizontal?: boolean; top?: number; unit?: string; zero?: boolean; right?: number; h?: number } = {}) {
  const sc = niceScale(lo, hi, 5, o.zero)
  const tickText = (v: number): string => `${compact(v)}${o.unit ?? ''}`
  const top = o.top ?? 16
  const h = o.h ?? H
  let svg = ''
  if (o.horizontal) {
    const labelW = Math.min(150, Math.max(40, ...cats.map((c) => textWidth(c, 12.5)))) + 18
    const box: Box = { x0: labelW, x1: W - (o.right ?? 24), y0: top, y1: h - 26 }
    const val = (v: number): number => box.x0 + ((v - sc.lo) / (sc.hi - sc.lo)) * (box.x1 - box.x0)
    for (const v of sc.ticks) {
      svg += `<line x1="${r1(val(v))}" y1="${box.y0}" x2="${r1(val(v))}" y2="${box.y1}" stroke="${v === 0 ? th.axis : th.grid}" stroke-width="1"/>`
      svg += t(val(v), box.y1 + 14, tickText(v), th.muted, { anchor: 'middle', size: 11.5 })
    }
    const size = (box.y1 - box.y0) / Math.max(1, cats.length)
    cats.forEach((c, i) => (svg += t(box.x0 - 10, box.y0 + size * (i + 0.5), clip(c, 12.5, labelW - 12), th.ink2, { anchor: 'end', size: 12.5 })))
    return { box, val, band: (i: number) => ({ start: box.y0 + size * i, size, mid: box.y0 + size * (i + 0.5) }), svg, base: val(Math.max(sc.lo, Math.min(0, sc.hi))) }
  }
  const labelW = Math.max(...sc.ticks.map((v) => textWidth(tickText(v), 11.5))) + 12
  const box: Box = { x0: labelW, x1: W - (o.right ?? 12), y0: top, y1: h - 28 }
  const val = (v: number): number => box.y1 - ((v - sc.lo) / (sc.hi - sc.lo)) * (box.y1 - box.y0)
  for (const v of sc.ticks) {
    svg += `<line x1="${box.x0}" y1="${r1(val(v))}" x2="${box.x1}" y2="${r1(val(v))}" stroke="${v === 0 ? th.axis : th.grid}" stroke-width="1"/>`
    svg += t(box.x0 - 8, val(v), tickText(v), th.muted, { anchor: 'end', size: 11.5 })
  }
  const size = (box.x1 - box.x0) / Math.max(1, cats.length)
  // Thin the labels until they don't collide.
  const widest = Math.max(...cats.map((c) => textWidth(c, 12)))
  const every = Math.max(1, Math.ceil((Math.min(widest, 90) + 8) / size))
  cats.forEach((c, i) => {
    if (i % every === 0) svg += t(box.x0 + size * (i + 0.5), box.y1 + 15, clip(c, 12, Math.max(size * every - 6, 30)), th.ink2, { anchor: 'middle', size: 12 })
  })
  return { box, val, band: (i: number) => ({ start: box.x0 + size * i, size, mid: box.x0 + size * (i + 0.5) }), svg, base: val(Math.max(sc.lo, Math.min(0, sc.hi))) }
}

/** Two linear axes (scatter, curves). */
function xyFrame(xs: [number, number], ys: [number, number], th: Theme, o: { top?: number; xUnit?: string; yUnit?: string; xName?: string; yName?: string; zeroY?: boolean } = {}) {
  const sx = niceScale(xs[0], xs[1], 6)
  const sy = niceScale(ys[0], ys[1], 5, o.zeroY)
  const yText = (v: number): string => `${compact(v)}${o.yUnit ?? ''}`
  const labelW = Math.max(...sy.ticks.map((v) => textWidth(yText(v), 11.5))) + 12
  const box: Box = { x0: labelW, x1: W - 16, y0: o.top ?? 16, y1: H - (o.xName ? 42 : 28) }
  const X = (v: number): number => box.x0 + ((v - sx.lo) / (sx.hi - sx.lo)) * (box.x1 - box.x0)
  const Y = (v: number): number => box.y1 - ((v - sy.lo) / (sy.hi - sy.lo)) * (box.y1 - box.y0)
  let svg = ''
  for (const v of sy.ticks) {
    svg += `<line x1="${box.x0}" y1="${r1(Y(v))}" x2="${box.x1}" y2="${r1(Y(v))}" stroke="${th.grid}" stroke-width="1"/>`
    svg += t(box.x0 - 8, Y(v), yText(v), th.muted, { anchor: 'end', size: 11.5 })
  }
  for (const v of sx.ticks) svg += t(X(v), box.y1 + 15, `${compact(v)}${o.xUnit ?? ''}`, th.muted, { anchor: 'middle', size: 11.5 })
  svg += `<line x1="${box.x0}" y1="${box.y1}" x2="${box.x1}" y2="${box.y1}" stroke="${th.axis}" stroke-width="1"/>`
  if (o.xName) svg += t((box.x0 + box.x1) / 2, H - 10, o.xName, th.muted, { anchor: 'middle', size: 12 })
  if (o.yName) svg += t(box.x0, box.y0 - 8, o.yName, th.muted, { size: 12 })
  return { box, X, Y, svg, sx, sy }
}

// --- Charts ---------------------------------------------------------------------------

export interface Series {
  name: string
  values: number[]
}

export function barChart(cats: string[], series: Series[], th: Theme, o: { horizontal?: boolean; mode?: 'group' | 'stack' | 'percent'; labels?: boolean; unit?: string; colors?: string[] } = {}): string {
  const mode = o.mode ?? 'group'
  const ss = series.slice(0, MAX_SERIES)
  const colors = o.colors ?? th.series
  const legendOn = ss.length > 1
  const rows = cats.map((_, i) => ss.map((s) => (Number.isFinite(s.values[i]) ? s.values[i] : 0)))
  const values =
    mode === 'percent'
      ? rows.map((r) => {
          const tot = r.reduce((a, b) => a + Math.max(0, b), 0) || 1
          return r.map((v) => (Math.max(0, v) / tot) * 100)
        })
      : rows
  const ext =
    mode === 'group'
      ? [Math.min(0, ...values.flat()), Math.max(0, ...values.flat())]
      : [Math.min(0, ...values.map((r) => r.reduce((a, v) => a + Math.min(0, v), 0))), Math.max(0, ...values.map((r) => r.reduce((a, v) => a + Math.max(0, v), 0)))]
  const unit = mode === 'percent' ? '%' : o.unit
  const f = bandFrame(cats, ext[0], mode === 'percent' ? 100 : ext[1], th, { horizontal: o.horizontal, top: legendOn ? 34 : 16, unit, zero: true, right: o.horizontal && o.labels ? 56 : undefined })
  let marks = ''
  let labels = ''
  const vert = !o.horizontal
  cats.forEach((cat, i) => {
    const band = f.band(i)
    const groups = mode === 'group' ? ss.length : 1
    const thick = Math.min(BAR_MAX, ((band.size * 0.72) - GAP * (groups - 1)) / groups)
    const start = band.mid - (thick * groups + GAP * (groups - 1)) / 2
    let posAcc = 0
    let negAcc = 0
    ss.forEach((s, j) => {
      const v = values[i][j]
      if (!Number.isFinite(rows[i][j]) || v === 0) return
      const lane = mode === 'group' ? start + j * (thick + GAP) : start
      let from: number
      let to: number
      if (mode === 'group') {
        from = 0
        to = v
      } else if (v >= 0) {
        from = posAcc
        to = posAcc += v
      } else {
        from = negAcc
        to = negAcc += v
      }
      const isEnd = mode === 'group' || j === lastNonZero(values[i], v >= 0)
      const a = f.val(from)
      const b = f.val(to)
      // A 2px surface gap between stacked segments.
      const inset = mode !== 'group' && from !== 0 ? GAP : 0
      const title = `${cat} · ${s.name}: ${fmt(rows[i][j])}${o.unit ?? ''}${mode === 'percent' ? ` (${fmt(v, 1)}%)` : ''}`
      if (vert) {
        const y = Math.min(a, b)
        const hgt = Math.abs(a - b) - inset
        marks += bar(lane, v >= 0 ? y : y + inset, thick, hgt, v >= 0 ? 'top' : 'bottom', colors[j], title, isEnd)
      } else {
        const x = Math.min(a, b)
        const wid = Math.abs(a - b) - inset
        marks += bar(v >= 0 ? x + inset : x, lane, wid, thick, v >= 0 ? 'right' : 'left', colors[j], title, isEnd)
      }
      if (o.labels && isEnd && mode !== 'percent') {
        const total = mode === 'group' ? rows[i][j] : rows[i].reduce((acc, x) => acc + x, 0)
        const txt = compact(total)
        if (vert) labels += t(lane + thick / 2, Math.min(a, b) - 8, txt, th.ink2, { anchor: 'middle', size: 11.5 })
        else labels += t(Math.max(a, b) + 6, lane + thick / 2, txt, th.ink2, { size: 11.5 })
      }
    })
  })
  const lg = legendOn ? legend(ss.map((s, j) => ({ name: s.name, color: colors[j] })), th, f.box.x0) : ''
  return svgDoc(f.svg + marks + labels + lg, th)
}

function lastNonZero(r: number[], positive: boolean): number {
  for (let k = r.length - 1; k >= 0; k--) if (r[k] !== 0 && r[k] >= 0 === positive) return k
  return -1
}

export interface LineSeries extends Series {
  color?: string
  dash?: boolean
  /** Shaded interval around the line (forecast band). */
  band?: { lo: number[]; hi: number[] }
  /** Draw the area under the line. */
  area?: boolean
  noDots?: boolean
}

export function lineChart(cats: string[], series: LineSeries[], th: Theme, o: { unit?: string; zero?: boolean; endLabels?: boolean; refLine?: { value: number; label: string } } = {}): string {
  const ss = series.slice(0, MAX_SERIES)
  const all = ss.flatMap((s) => [...s.values, ...(s.band?.lo ?? []), ...(s.band?.hi ?? [])]).filter(Number.isFinite)
  if (o.refLine) all.push(o.refLine.value)
  const legendOn = ss.length > 1
  const f = bandFrame(cats, Math.min(...all), Math.max(...all), th, { top: legendOn ? 34 : 16, unit: o.unit, zero: o.zero, right: o.endLabels ? 52 : 12 })
  let body = ''
  if (o.refLine) {
    const y = f.val(o.refLine.value)
    body += `<line x1="${f.box.x0}" y1="${r1(y)}" x2="${f.box.x1}" y2="${r1(y)}" stroke="${th.muted}" stroke-width="1"/>` + t(f.box.x1 - 2, y - 8, o.refLine.label, th.muted, { anchor: 'end', size: 11.5 })
  }
  const lastLabels: number[] = []
  ss.forEach((s, j) => {
    const color = s.color ?? th.series[j]
    const pts = s.values.map((v, i) => [f.band(i).mid, Number.isFinite(v) ? f.val(v) : NaN] as [number, number])
    if (s.band) {
      const idx = s.values.map((_, i) => i).filter((i) => Number.isFinite(s.band!.lo[i]) && Number.isFinite(s.band!.hi[i]))
      if (idx.length > 1) {
        const up = idx.map((i) => [f.band(i).mid, f.val(s.band!.hi[i])] as [number, number])
        const down = idx.map((i) => [f.band(i).mid, f.val(s.band!.lo[i])] as [number, number]).reverse()
        body += `<path d="${linePath([...up, ...down])}Z" fill="${color}" fill-opacity="0.12"/>`
      }
    }
    // Break the line at gaps (blank cells).
    const runs: [number, number][][] = [[]]
    pts.forEach((p) => (Number.isFinite(p[1]) ? runs[runs.length - 1].push(p) : runs.push([])))
    for (const run of runs.filter((r) => r.length)) {
      if (s.area && run.length > 1) body += `<path d="${linePath(run)}L${run[run.length - 1][0]},${f.base}L${run[0][0]},${f.base}Z" fill="${color}" fill-opacity="0.1"/>`
      body += `<path d="${linePath(run)}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"${s.dash ? ' stroke-dasharray="5 4"' : ''}/>`
    }
    const showDots = !s.noDots && cats.length <= 24
    pts.forEach(([x, y], i) => {
      if (!Number.isFinite(y)) return
      const title = `${cats[i]} · ${s.name}: ${fmt(s.values[i])}${o.unit ?? ''}`
      body += showDots ? dot(x, y, color, th, title) : `<circle cx="${r1(x)}" cy="${r1(y)}" r="9" fill="transparent">${tip(title)}</circle>`
    })
    if (o.endLabels) {
      const last = pts.map((p, i) => [p, i] as const).filter(([p]) => Number.isFinite(p[1])).pop()
      if (last && !lastLabels.some((y) => Math.abs(y - last[0][1]) < 13)) {
        lastLabels.push(last[0][1])
        body += t(last[0][0] + 9, last[0][1], compact(s.values[last[1]]), th.ink2, { size: 11.5, weight: 600 })
      }
    }
  })
  const lg = legendOn ? legend(ss.map((s, j) => ({ name: s.name, color: s.color ?? th.series[j], line: true, dash: s.dash })), th, f.box.x0) : ''
  return svgDoc(f.svg + body + lg, th)
}

/** Pie / donut with the legend table on the right. Past 8 slices the rest folds into 기타. */
export function pieChart(items: { name: string; value: number }[], th: Theme, o: { donut?: boolean; unit?: string; centerLabel?: string } = {}): string {
  const pos = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value)
  const shown = pos.length > MAX_SERIES ? [...pos.slice(0, MAX_SERIES - 1), { name: '기타', value: pos.slice(MAX_SERIES - 1).reduce((s, i) => s + i.value, 0) }] : pos
  const total = shown.reduce((s, i) => s + i.value, 0)
  const cx = 170
  const cy = H / 2
  const ro = 140
  const ri = o.donut ? 84 : 0
  let a0 = -Math.PI / 2
  let body = ''
  shown.forEach((it, j) => {
    const frac = it.value / total
    const a1 = a0 + frac * Math.PI * 2
    const color = th.series[j]
    const title = `${it.name}: ${fmt(it.value)}${o.unit ?? ''} (${fmt(frac * 100, 1)}%)`
    if (frac >= 0.9999) {
      body += `<circle cx="${cx}" cy="${cy}" r="${ro}" fill="${color}">${tip(title)}</circle>` + (ri ? `<circle cx="${cx}" cy="${cy}" r="${ri}" fill="${th.surface}"/>` : '')
    } else {
      const large = a1 - a0 > Math.PI ? 1 : 0
      const p = (r: number, a: number): string => `${r1(cx + r * Math.cos(a))},${r1(cy + r * Math.sin(a))}`
      const d = ri
        ? `M${p(ro, a0)}A${ro},${ro} 0 ${large} 1 ${p(ro, a1)}L${p(ri, a1)}A${ri},${ri} 0 ${large} 0 ${p(ri, a0)}Z`
        : `M${cx},${cy}L${p(ro, a0)}A${ro},${ro} 0 ${large} 1 ${p(ro, a1)}Z`
      body += `<path d="${d}" fill="${color}" stroke="${th.surface}" stroke-width="${GAP}" stroke-linejoin="round">${tip(title)}</path>`
    }
    // Percent inside the slice when it fits.
    if (frac >= 0.06) {
      const mid = (a0 + a1) / 2
      const rr = ri ? (ro + ri) / 2 : ro * 0.64
      body += t(cx + rr * Math.cos(mid), cy + rr * Math.sin(mid), `${Math.round(frac * 100)}%`, inkOn(color, th), { anchor: 'middle', size: 13, weight: 600 })
    }
    a0 = a1
  })
  if (ri) {
    body += t(cx, cy - 10, o.centerLabel ?? '합계', th.muted, { anchor: 'middle', size: 12.5 })
    body += t(cx, cy + 12, `${compact(total)}${o.unit ?? ''}`, th.ink, { anchor: 'middle', size: 20, weight: 700 })
  }
  // Legend table: swatch, name, value, share.
  const lx = 352
  const rowH = Math.min(34, (H - 40) / shown.length)
  const ly = cy - (rowH * shown.length) / 2 + rowH / 2
  shown.forEach((it, j) => {
    const y = ly + j * rowH
    body += `<rect x="${lx}" y="${r1(y - 5)}" width="10" height="10" rx="2.5" fill="${th.series[j]}"/>`
    body += t(lx + 18, y, clip(it.name, 13, 132), th.ink, { size: 13 })
    body += t(W - 70, y, `${compact(it.value)}${o.unit ?? ''}`, th.ink2, { anchor: 'end', size: 13 })
    body += t(W - 16, y, `${fmt((it.value / total) * 100, 1)}%`, th.ink, { anchor: 'end', size: 13, weight: 600 })
  })
  return svgDoc(body, th)
}

/** Ink or white on a fill, whichever reads better. */
function inkOn(hex: string, th: Theme): string {
  const n = parseInt(hex.slice(1), 16)
  const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255
  return lum > 0.62 ? '#0b0b0b' : th === THEMES.dark ? '#f0efec' : '#ffffff'
}

export function scatterChart(points: { x: number; y: number; label?: string }[], th: Theme, o: { xName?: string; yName?: string; fit?: { slope: number; intercept: number; band?: (x: number) => number } } = {}): string {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const f = xyFrame([Math.min(...xs), Math.max(...xs)], [Math.min(...ys), Math.max(...ys)], th, { xName: o.xName, yName: o.yName, top: o.yName ? 28 : 16 })
  let body = ''
  if (o.fit) {
    const { slope, intercept, band } = o.fit
    const xa = f.sx.lo
    const xb = f.sx.hi
    const clampY = (y: number): number => Math.max(f.box.y0, Math.min(f.box.y1, y))
    if (band) {
      const steps = 40
      const xsS = Array.from({ length: steps + 1 }, (_, i) => xa + ((xb - xa) * i) / steps)
      const up = xsS.map((x) => [f.X(x), clampY(f.Y(slope * x + intercept + band(x)))] as [number, number])
      const dn = xsS.map((x) => [f.X(x), clampY(f.Y(slope * x + intercept - band(x)))] as [number, number]).reverse()
      body += `<path d="${linePath([...up, ...dn])}Z" fill="${th.series[1]}" fill-opacity="0.1"/>`
    }
    const clipId = `plot-${++clipSeq}`
    body += `<clipPath id="${clipId}"><rect x="${f.box.x0}" y="${f.box.y0}" width="${f.box.x1 - f.box.x0}" height="${f.box.y1 - f.box.y0}"/></clipPath>`
    body += `<line clip-path="url(#${clipId})" x1="${r1(f.X(xa))}" y1="${r1(f.Y(slope * xa + intercept))}" x2="${r1(f.X(xb))}" y2="${r1(f.Y(slope * xb + intercept))}" stroke="${th.series[1]}" stroke-width="2" stroke-linecap="round"/>`
  }
  for (const p of points) body += dot(f.X(p.x), f.Y(p.y), th.series[0], th, `${p.label ? `${p.label} · ` : ''}${o.xName ?? 'X'} ${fmt(p.x)}, ${o.yName ?? 'Y'} ${fmt(p.y)}`)
  return svgDoc(f.svg + body, th)
}

/** Contiguous columns over a numeric range (histogram) with an optional density curve. */
export function histogramChart(bins: { lo: number; hi: number; count: number }[], th: Theme, o: { curve?: (x: number) => number; xName?: string } = {}): string {
  const lo = bins[0].lo
  const hi = bins[bins.length - 1].hi
  const maxC = Math.max(...bins.map((b) => b.count))
  const f = xyFrame([lo, hi], [0, maxC], th, { zeroY: true, xName: o.xName })
  let body = ''
  for (const b of bins) {
    const x0 = f.X(b.lo) + GAP / 2
    const x1 = f.X(b.hi) - GAP / 2
    body += bar(x0, f.Y(b.count), x1 - x0, f.Y(0) - f.Y(b.count), 'top', th.series[0], `${fmt(b.lo)} ~ ${fmt(b.hi)}: ${b.count}개`)
  }
  if (o.curve) {
    const steps = 80
    const pts = Array.from({ length: steps + 1 }, (_, i) => {
      const x = lo + ((hi - lo) * i) / steps
      return [f.X(x), Math.max(f.box.y0, f.Y(o.curve!(x)))] as [number, number]
    })
    body += `<path d="${linePath(pts)}" fill="none" stroke="${th.series[1]}" stroke-width="2" stroke-linecap="round"/>`
    body += legend([{ name: '도수', color: th.series[0] }, { name: '정규분포 곡선', color: th.series[1], line: true }], th, W - 210, 10)
  }
  return svgDoc(f.svg + body, th)
}

export interface BoxGroup {
  name: string
  q1: number
  median: number
  q3: number
  lo: number
  hi: number
  mean: number
  outliers: number[]
}

export function boxChart(groups: BoxGroup[], th: Theme, o: { unit?: string } = {}): string {
  const all = groups.flatMap((g) => [g.lo, g.hi, ...g.outliers])
  const f = bandFrame(groups.map((g) => g.name), Math.min(...all), Math.max(...all), th, { unit: o.unit })
  let body = ''
  groups.forEach((g, i) => {
    const b = f.band(i)
    const w = Math.min(56, b.size * 0.5)
    const x = b.mid - w / 2
    const color = th.series[0]
    const title = `${g.name}\n최솟값(수염) ${fmt(g.lo)} · Q1 ${fmt(g.q1)} · 중앙값 ${fmt(g.median)} · Q3 ${fmt(g.q3)} · 최댓값(수염) ${fmt(g.hi)} · 평균 ${fmt(g.mean)}`
    body += `<line x1="${r1(b.mid)}" y1="${r1(f.val(g.hi))}" x2="${r1(b.mid)}" y2="${r1(f.val(g.q3))}" stroke="${th.ink2}" stroke-width="1.5"/>`
    body += `<line x1="${r1(b.mid)}" y1="${r1(f.val(g.q1))}" x2="${r1(b.mid)}" y2="${r1(f.val(g.lo))}" stroke="${th.ink2}" stroke-width="1.5"/>`
    for (const v of [g.lo, g.hi]) body += `<line x1="${r1(b.mid - w / 4)}" y1="${r1(f.val(v))}" x2="${r1(b.mid + w / 4)}" y2="${r1(f.val(v))}" stroke="${th.ink2}" stroke-width="1.5" stroke-linecap="round"/>`
    body += `<rect x="${r1(x)}" y="${r1(f.val(g.q3))}" width="${r1(w)}" height="${r1(Math.max(1, f.val(g.q1) - f.val(g.q3)))}" rx="4" fill="${color}" fill-opacity="0.18" stroke="${color}" stroke-width="1.5">${tip(title)}</rect>`
    body += `<line x1="${r1(x)}" y1="${r1(f.val(g.median))}" x2="${r1(x + w)}" y2="${r1(f.val(g.median))}" stroke="${color}" stroke-width="2.5"/>`
    body += `<path d="M${r1(b.mid)},${r1(f.val(g.mean) - 4.5)}l4.5,4.5l-4.5,4.5l-4.5,-4.5Z" fill="${th.surface}" stroke="${th.ink}" stroke-width="1.5">${tip(`${g.name} 평균 ${fmt(g.mean)}`)}</path>`
    for (const v of g.outliers) body += `<circle cx="${r1(b.mid)}" cy="${r1(f.val(v))}" r="3.5" fill="none" stroke="${th.series[1]}" stroke-width="1.5">${tip(`${g.name} 이상치 ${fmt(v)}`)}</circle>`
  })
  return svgDoc(f.svg + body, th)
}

/** Bars of share (%) with the cumulative line on the same 0–100% axis and an 80% guide. */
export function paretoChart(items: { name: string; value: number }[], th: Theme): string {
  const total = items.reduce((s, i) => s + i.value, 0)
  const cats = items.map((i) => i.name)
  const f = bandFrame(cats, 0, 100, th, { top: 34, unit: '%', zero: true })
  let body = `<line x1="${f.box.x0}" y1="${r1(f.val(80))}" x2="${f.box.x1}" y2="${r1(f.val(80))}" stroke="${th.muted}" stroke-width="1"/>` + t(f.box.x1 - 2, f.val(80) - 8, '80%', th.muted, { anchor: 'end', size: 11.5 })
  let cum = 0
  const pts: [number, number][] = []
  items.forEach((it, i) => {
    const b = f.band(i)
    const share = (it.value / total) * 100
    cum += share
    const w = Math.min(BAR_MAX * 1.5, b.size * 0.7)
    body += bar(b.mid - w / 2, f.val(share), w, f.val(0) - f.val(share), 'top', th.series[0], `${it.name}: ${fmt(it.value)} (${fmt(share, 1)}%)`)
    pts.push([b.mid, f.val(cum)])
  })
  body += `<path d="${linePath(pts)}" fill="none" stroke="${th.series[1]}" stroke-width="2" stroke-linejoin="round"/>`
  cum = 0
  pts.forEach(([x, y], i) => {
    cum += (items[i].value / total) * 100
    body += dot(x, y, th.series[1], th, `${items[i].name}까지 누적 ${fmt(cum, 1)}%`)
  })
  body += legend([{ name: '비중', color: th.series[0] }, { name: '누적 비중', color: th.series[1], line: true }], th, f.box.x0)
  return svgDoc(f.svg + body, th)
}

/** Running total: base → ups and downs → end total. Increase/decrease use the diverging poles. */
export function waterfallChart(steps: { name: string; value: number; total?: boolean; base?: boolean }[], th: Theme, o: { unit?: string } = {}): string {
  let run = 0
  const spans = steps.map((s) => {
    const from = s.total || s.base ? 0 : run
    const to = s.total ? run : s.base ? s.value : run + s.value
    if (!s.total) run = to
    return { ...s, from, to }
  })
  const vals = spans.flatMap((s) => [s.from, s.to])
  const f = bandFrame(steps.map((s) => s.name), Math.min(...vals), Math.max(...vals), th, { top: 34, unit: o.unit, zero: true })
  let body = ''
  spans.forEach((s, i) => {
    const b = f.band(i)
    const w = Math.min(BAR_MAX * 1.6, b.size * 0.66)
    const up = s.to >= s.from
    const level = s.total || s.base // an absolute level, not a change
    const color = level ? th.ink2 : up ? th.pos : th.neg
    const y = f.val(Math.max(s.from, s.to))
    const h = Math.max(1, Math.abs(f.val(s.from) - f.val(s.to)))
    body += bar(b.mid - w / 2, y, w, h, up ? 'top' : 'bottom', color, `${s.name}: ${level ? '' : up ? '+' : ''}${fmt(level ? s.to : s.value)}${o.unit ?? ''}`)
    body += t(b.mid, up ? y - 9 : y + h + 10, `${level ? (s.to < 0 ? '−' : '') : up ? '+' : '−'}${compact(Math.abs(level ? s.to : s.value))}`, th.ink2, { anchor: 'middle', size: 11.5, weight: level ? 700 : 500 })
    const next = spans[i + 1]
    if (next) {
      const ny = f.val(s.to)
      body += `<line x1="${r1(b.mid + w / 2)}" y1="${r1(ny)}" x2="${r1(f.band(i + 1).mid - w / 2)}" y2="${r1(ny)}" stroke="${th.axis}" stroke-width="1"/>`
    }
  })
  body += legend([{ name: '증가', color: th.pos }, { name: '감소', color: th.neg }, { name: '시작·최종', color: th.ink2 }], th, f.box.x0)
  return svgDoc(f.svg + body, th)
}

/** Radar (spider) chart; caps at 3 series — beyond that the shapes stop being readable. */
export function radarChart(axes: string[], series: Series[], th: Theme): string {
  const ss = series.slice(0, 3)
  const max = niceScale(0, Math.max(...ss.flatMap((s) => s.values.filter(Number.isFinite))), 4, true)
  const cx = W / 2
  const cy = H / 2 + (ss.length > 1 ? 12 : 4)
  const rad = 128
  const ang = (i: number): number => -Math.PI / 2 + (i * 2 * Math.PI) / axes.length
  const pt = (i: number, v: number): [number, number] => [cx + (rad * v * Math.cos(ang(i))) / max.hi, cy + (rad * v * Math.sin(ang(i))) / max.hi]
  let body = ''
  for (const v of max.ticks.slice(1)) {
    body += `<path d="${linePath(axes.map((_, i) => pt(i, v)))}Z" fill="none" stroke="${th.grid}" stroke-width="1"/>`
    body += t(cx + 4, cy - (rad * v) / max.hi, compact(v), th.muted, { size: 11 })
  }
  axes.forEach((a, i) => {
    const [x, y] = pt(i, max.hi)
    body += `<line x1="${cx}" y1="${cy}" x2="${r1(x)}" y2="${r1(y)}" stroke="${th.grid}" stroke-width="1"/>`
    const [lx, ly] = pt(i, max.hi * 1.13)
    const c = Math.cos(ang(i))
    body += t(lx, ly, clip(a, 12.5, 110), th.ink2, { anchor: Math.abs(c) < 0.2 ? 'middle' : c > 0 ? 'start' : 'end', size: 12.5 })
  })
  ss.forEach((s, j) => {
    const pts = axes.map((_, i) => pt(i, Number.isFinite(s.values[i]) ? s.values[i] : 0))
    body += `<path d="${linePath(pts)}Z" fill="${th.series[j]}" fill-opacity="0.12" stroke="${th.series[j]}" stroke-width="2" stroke-linejoin="round"/>`
    pts.forEach(([x, y], i) => (body += dot(x, y, th.series[j], th, `${s.name} · ${axes[i]}: ${fmt(s.values[i])}`)))
  })
  if (ss.length > 1) body += legend(ss.map((s, j) => ({ name: s.name, color: th.series[j] })), th, 16)
  return svgDoc(body, th)
}

const mix = (a: string, b: string, k: number): string => {
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const ch = (s: number): number => Math.round(((pa >> s) & 255) + (((pb >> s) & 255) - ((pa >> s) & 255)) * k)
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`
}

/** Sequential (one hue) or diverging (−1…1, gray midpoint) cell colour. */
function cellColor(v: number, lo: number, hi: number, th: Theme, diverging: boolean): string {
  if (diverging) {
    const k = Math.max(-1, Math.min(1, v / Math.max(Math.abs(lo), Math.abs(hi), 1e-9)))
    return k >= 0 ? mix(th.mid, th.pos, k) : mix(th.mid, th.neg, -k)
  }
  // Near zero recedes toward the surface in both themes (the dark ramp runs dark → light).
  const k = hi > lo ? (v - lo) / (hi - lo) : 0.5
  return th.ramp[Math.round(k * (th.ramp.length - 1))]
}

export function heatmapChart(rows: string[], cols: string[], values: number[][], th: Theme, o: { diverging?: boolean; digits?: number } = {}): string {
  const flat = values.flat().filter(Number.isFinite)
  const lo = Math.min(...flat)
  const hi = Math.max(...flat)
  const labelW = Math.min(130, Math.max(...rows.map((r) => textWidth(r, 12.5)))) + 14
  const top = 30
  const x0 = labelW
  const cw = (W - x0 - 8) / cols.length
  const ch = Math.min(44, (H - top - 30) / rows.length)
  let body = ''
  cols.forEach((c, j) => (body += t(x0 + cw * (j + 0.5), top - 12, clip(c, 12, cw - 4), th.ink2, { anchor: 'middle', size: 12 })))
  rows.forEach((r, i) => {
    const y = top + i * ch
    body += t(x0 - 10, y + ch / 2, clip(r, 12.5, labelW - 14), th.ink2, { anchor: 'end', size: 12.5 })
    cols.forEach((c, j) => {
      const v = values[i]?.[j]
      if (!Number.isFinite(v)) return
      const fill = cellColor(v, lo, hi, th, Boolean(o.diverging))
      body += `<rect x="${r1(x0 + j * cw + 1)}" y="${r1(y + 1)}" width="${r1(cw - GAP)}" height="${r1(ch - GAP)}" rx="3" fill="${fill}">${tip(`${r} × ${c}: ${fmt(v, o.digits ?? 2)}`)}</rect>`
      const txt = o.digits !== undefined ? fmt(v, o.digits) : compact(v)
      if (textWidth(txt, 12) < cw - 8 && ch >= 18) body += t(x0 + cw * (j + 0.5), y + ch / 2, txt, inkOn(fill, th), { anchor: 'middle', size: 12, weight: 500 })
    })
  })
  // Scale key.
  const ky = top + rows.length * ch + 16
  if (ky < H - 6) {
    const stops = 24
    for (let k = 0; k < stops; k++) {
      const v = lo + ((hi - lo) * k) / (stops - 1)
      body += `<rect x="${r1(x0 + k * 6)}" y="${ky - 4}" width="6" height="8" fill="${cellColor(o.diverging ? -1 + (2 * k) / (stops - 1) : v, o.diverging ? -1 : lo, o.diverging ? 1 : hi, th, Boolean(o.diverging))}"/>`
    }
    body += t(x0 - 6, ky, o.diverging ? '−1' : compact(lo), th.muted, { anchor: 'end', size: 11 }) + t(x0 + stops * 6 + 6, ky, o.diverging ? '+1' : compact(hi), th.muted, { size: 11 })
    return svgDoc(body, th, Math.max(ky + 14, 120))
  }
  return svgDoc(body, th)
}

/** 목표 대비 실적: a bar per item with the target as a tick and the attainment %. */
export function bulletChart(items: { name: string; actual: number; target: number }[], th: Theme, o: { unit?: string } = {}): string {
  const max = Math.max(...items.flatMap((i) => [i.actual, i.target]))
  const f = bandFrame(items.map((i) => i.name), 0, max, th, { horizontal: true, top: 32, unit: o.unit, zero: true, right: 64 })
  let body = ''
  items.forEach((it, i) => {
    const b = f.band(i)
    const thick = Math.min(18, b.size * 0.5)
    body += `<rect x="${f.box.x0}" y="${r1(b.mid - thick / 2 - 4)}" width="${r1(f.val(it.target) - f.box.x0)}" height="${r1(thick + 8)}" rx="4" fill="${th.grid}" fill-opacity="0.7"/>`
    body += bar(f.box.x0, b.mid - thick / 2, f.val(it.actual) - f.box.x0, thick, 'right', th.series[0], `${it.name}: 실적 ${fmt(it.actual)}${o.unit ?? ''} / 목표 ${fmt(it.target)}${o.unit ?? ''}`)
    const tx = f.val(it.target)
    body += `<line x1="${r1(tx)}" y1="${r1(b.mid - thick / 2 - 7)}" x2="${r1(tx)}" y2="${r1(b.mid + thick / 2 + 7)}" stroke="${th.ink}" stroke-width="2.5" stroke-linecap="round">${tip(`목표 ${fmt(it.target)}`)}</line>`
    const pct = (it.actual / it.target) * 100
    body += t(W - 12, b.mid, `${pct >= 100 ? '✓ ' : ''}${fmt(pct, 0)}%`, pct >= 100 ? th.ink : th.ink2, { anchor: 'end', size: 13, weight: 600 })
  })
  body += `<rect x="${f.box.x0}" y="5" width="10" height="10" rx="2.5" fill="${th.series[0]}"/>` + t(f.box.x0 + 16, 10, '실적', th.ink2, { size: 12.5 })
  body += `<line x1="${f.box.x0 + 58}" y1="4" x2="${f.box.x0 + 58}" y2="16" stroke="${th.ink}" stroke-width="2.5" stroke-linecap="round"/>` + t(f.box.x0 + 66, 10, '목표', th.ink2, { size: 12.5 })
  return svgDoc(f.svg + body, th)
}

/** Squarified treemap, coloured by size on the sequential ramp. */
export function treemapChart(items: { name: string; value: number }[], th: Theme, o: { unit?: string } = {}): string {
  const data = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value)
  const total = data.reduce((s, i) => s + i.value, 0)
  const rects: { it: { name: string; value: number }; x: number; y: number; w: number; h: number }[] = []
  let box = { x: 0, y: 0, w: W, h: H }
  let rest = data.map((it) => ({ it, area: (it.value / total) * W * H }))
  const worst = (row: number[], side: number): number => {
    const s = row.reduce((a, b) => a + b, 0)
    return Math.max(...row.map((r) => Math.max((side * side * r) / (s * s), (s * s) / (side * side * r))))
  }
  while (rest.length) {
    const side = Math.min(box.w, box.h)
    let row = [rest[0]]
    let k = 1
    while (k < rest.length && worst([...row, rest[k]].map((r) => r.area), side) <= worst(row.map((r) => r.area), side)) row = [...row, rest[k++]]
    const s = row.reduce((a, r) => a + r.area, 0)
    const horizontal = box.w >= box.h
    const thick = s / side
    let off = 0
    for (const r of row) {
      const len = r.area / thick
      rects.push(horizontal ? { it: r.it, x: box.x, y: box.y + off, w: thick, h: len } : { it: r.it, x: box.x + off, y: box.y, w: len, h: thick })
      off += len
    }
    box = horizontal ? { x: box.x + thick, y: box.y, w: box.w - thick, h: box.h } : { x: box.x, y: box.y + thick, w: box.w, h: box.h - thick }
    rest = rest.slice(k)
  }
  const lo = Math.min(...data.map((d) => d.value))
  const hi = Math.max(...data.map((d) => d.value))
  const body = rects
    .map(({ it, x, y, w, h }) => {
      const fill = cellColor(it.value, lo - (hi - lo) * 0.25, hi, th, false)
      const ink = inkOn(fill, th)
      const share = `${fmt((it.value / total) * 100, 1)}%`
      let s = `<rect x="${r1(x + 1)}" y="${r1(y + 1)}" width="${r1(Math.max(0, w - GAP))}" height="${r1(Math.max(0, h - GAP))}" rx="4" fill="${fill}">${tip(`${it.name}: ${fmt(it.value)}${o.unit ?? ''} (${share})`)}</rect>`
      if (w > 54 && h > 36) {
        s += t(x + 10, y + 17, clip(it.name, 13.5, w - 18), ink, { size: 13.5, weight: 600 })
        s += t(x + 10, y + 34, `${compact(it.value)}${o.unit ?? ''} · ${share}`, ink, { size: 12 })
      } else if (w > 30 && h > 18) s += t(x + w / 2, y + h / 2, clip(it.name, 11, w - 6), ink, { anchor: 'middle', size: 11 })
      return s
    })
    .join('')
  return svgDoc(body, th)
}

/** Before → after per category. */
export function dumbbellChart(cats: string[], a: Series, b: Series, th: Theme, o: { unit?: string } = {}): string {
  const all = [...a.values, ...b.values].filter(Number.isFinite)
  const f = bandFrame(cats, Math.min(...all), Math.max(...all), th, { horizontal: true, top: 34, unit: o.unit, right: 64 })
  let body = ''
  cats.forEach((c, i) => {
    const y = f.band(i).mid
    const va = a.values[i]
    const vb = b.values[i]
    if (!Number.isFinite(va) || !Number.isFinite(vb)) return
    body += `<line x1="${r1(f.val(va))}" y1="${r1(y)}" x2="${r1(f.val(vb))}" y2="${r1(y)}" stroke="${th.axis}" stroke-width="3" stroke-linecap="round"/>`
    body += dot(f.val(va), y, th.series[0], th, `${c} · ${a.name}: ${fmt(va)}${o.unit ?? ''}`, 5)
    body += dot(f.val(vb), y, th.series[1], th, `${c} · ${b.name}: ${fmt(vb)}${o.unit ?? ''}`, 5)
    const d = vb - va
    body += t(W - 12, y, `${d >= 0 ? '+' : '−'}${compact(Math.abs(d))}`, th.ink2, { anchor: 'end', size: 12.5, weight: 600 })
  })
  body += legend([{ name: a.name, color: th.series[0] }, { name: b.name, color: th.series[1] }], th, f.box.x0)
  return svgDoc(f.svg + body, th)
}

/** Point estimate ± interval per group (forest-plot style), optional reference line. */
export function intervalChart(groups: { name: string; value: number; lo: number; hi: number }[], th: Theme, o: { unit?: string; ref?: number; refLabel?: string } = {}): string {
  const all = groups.flatMap((g) => [g.lo, g.hi, g.value]).concat(o.ref !== undefined ? [o.ref] : []).filter(Number.isFinite)
  const pad = (Math.max(...all) - Math.min(...all)) * 0.08 || 1
  const f = bandFrame(groups.map((g) => g.name), Math.min(...all) - pad, Math.max(...all) + pad, th, { horizontal: true, unit: o.unit, top: 20 })
  let body = ''
  if (o.ref !== undefined) {
    const x = f.val(o.ref)
    body += `<line x1="${r1(x)}" y1="${f.box.y0}" x2="${r1(x)}" y2="${f.box.y1}" stroke="${th.muted}" stroke-width="1.5"/>` + (o.refLabel ? t(x + 4, f.box.y0 - 8, o.refLabel, th.muted, { size: 11.5 }) : '')
  }
  groups.forEach((g, i) => {
    const y = f.band(i).mid
    const color = th.series[i % 3]
    body += `<line x1="${r1(f.val(g.lo))}" y1="${r1(y)}" x2="${r1(f.val(g.hi))}" y2="${r1(y)}" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>`
    for (const v of [g.lo, g.hi]) body += `<line x1="${r1(f.val(v))}" y1="${r1(y - 7)}" x2="${r1(f.val(v))}" y2="${r1(y + 7)}" stroke="${color}" stroke-width="2" stroke-linecap="round"/>`
    body += dot(f.val(g.value), y, color, th, `${g.name}: ${fmt(g.value)}${o.unit ?? ''} (95% 구간 ${fmt(g.lo)} ~ ${fmt(g.hi)})`, 6)
    body += t(f.val(g.value), y - 16, `${fmt(g.value)}${o.unit ?? ''}`, th.ink, { anchor: 'middle', size: 12.5, weight: 600 })
  })
  return svgDoc(f.svg + body, th)
}

/** A function curve over x with optional shaded span and markers (normal curve, error vs n). */
export function curveChart(fn: (x: number) => number, x0: number, x1: number, th: Theme, o: { shade?: [number, number]; marks?: { x: number; label: string }[]; xName?: string; yName?: string; yUnit?: string; xTicks?: { v: number; label: string }[]; zeroY?: boolean } = {}): string {
  const steps = 160
  const xs = Array.from({ length: steps + 1 }, (_, i) => x0 + ((x1 - x0) * i) / steps)
  const ys = xs.map(fn)
  const f = xyFrame([x0, x1], [Math.min(0, ...ys), Math.max(...ys)], th, { xName: o.xName, yName: o.yName, yUnit: o.yUnit, zeroY: o.zeroY ?? true, top: o.yName ? 28 : 16 })
  let body = ''
  if (o.shade) {
    const [a, b] = [Math.max(x0, o.shade[0]), Math.min(x1, o.shade[1])]
    if (b > a) {
      const sx = Array.from({ length: 81 }, (_, i) => a + ((b - a) * i) / 80)
      body += `<path d="${linePath([[f.X(a), f.Y(0)], ...sx.map((x) => [f.X(x), f.Y(fn(x))] as [number, number]), [f.X(b), f.Y(0)]])}Z" fill="${th.series[0]}" fill-opacity="0.22"/>`
    }
  }
  body += `<path d="${linePath(xs.map((x, i) => [f.X(x), f.Y(ys[i])]))}" fill="none" stroke="${th.series[0]}" stroke-width="2" stroke-linejoin="round"/>`
  for (const m of o.marks ?? []) {
    if (m.x < x0 || m.x > x1) continue
    const x = f.X(m.x)
    body += `<line x1="${r1(x)}" y1="${f.box.y0}" x2="${r1(x)}" y2="${f.box.y1}" stroke="${th.ink2}" stroke-width="1.5"/>` + dot(x, f.Y(fn(m.x)), th.series[1], th, m.label, 5)
    body += t(x + (x > W - 140 ? -6 : 6), f.box.y0 + 8, m.label, th.ink, { size: 12, weight: 600, anchor: x > W - 140 ? 'end' : 'start' })
  }
  return svgDoc(f.svg + body, th)
}
