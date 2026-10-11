// Statistics for the 통계·그래프 tools. Pure functions, no dependencies: the renderer
// shows the results live and the main process re-computes them for PDF/PPTX export.

/** "1,234", " 12.5% ", "-3" → number; blanks and junk → NaN. */
export function parseNum(raw: string | undefined): number {
  const s = (raw ?? '').replace(/[,\s원%₩$]/g, '')
  if (!s || !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return NaN
  return Number(s)
}

export const finite = (xs: readonly number[]): number[] => xs.filter(Number.isFinite)
export const sum = (xs: readonly number[]): number => xs.reduce((s, x) => s + x, 0)
export const mean = (xs: readonly number[]): number => (xs.length ? sum(xs) / xs.length : NaN)

/** Sample variance (n − 1). */
export function variance(xs: readonly number[]): number {
  if (xs.length < 2) return NaN
  const m = mean(xs)
  return sum(xs.map((x) => (x - m) ** 2)) / (xs.length - 1)
}
export const sd = (xs: readonly number[]): number => Math.sqrt(variance(xs))

const sorted = (xs: readonly number[]): number[] => [...xs].sort((a, b) => a - b)

/** Linear-interpolated quantile (Excel QUARTILE.INC / R type 7). */
export function quantile(xs: readonly number[], q: number): number {
  if (!xs.length) return NaN
  const s = sorted(xs)
  const pos = (s.length - 1) * q
  const lo = Math.floor(pos)
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (pos - lo)
}
export const median = (xs: readonly number[]): number => quantile(xs, 0.5)

/** Most frequent values (empty when every value occurs once). */
export function modes(xs: readonly number[]): number[] {
  const counts = new Map<number, number>()
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1)
  const top = Math.max(0, ...counts.values())
  return top < 2 ? [] : [...counts].filter(([, c]) => c === top).map(([v]) => v)
}

/** Adjusted Fisher–Pearson skewness (Excel SKEW). */
export function skewness(xs: readonly number[]): number {
  const n = xs.length
  if (n < 3) return NaN
  const m = mean(xs)
  const s = sd(xs)
  return (n / ((n - 1) * (n - 2))) * sum(xs.map((x) => ((x - m) / s) ** 3))
}

/** Excess kurtosis (Excel KURT). */
export function kurtosis(xs: readonly number[]): number {
  const n = xs.length
  if (n < 4) return NaN
  const m = mean(xs)
  const s = sd(xs)
  const k = sum(xs.map((x) => ((x - m) / s) ** 4))
  return ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * k - (3 * (n - 1) ** 2) / ((n - 2) * (n - 3))
}

export interface FiveNumber {
  min: number
  q1: number
  median: number
  q3: number
  max: number
  /** Whisker ends: the furthest points within 1.5 × IQR. */
  lo: number
  hi: number
  outliers: number[]
}

export function fiveNumber(xs: readonly number[]): FiveNumber {
  const q1 = quantile(xs, 0.25)
  const q3 = quantile(xs, 0.75)
  const fence = 1.5 * (q3 - q1)
  const inside = xs.filter((x) => x >= q1 - fence && x <= q3 + fence)
  return {
    min: Math.min(...xs),
    q1,
    median: median(xs),
    q3,
    max: Math.max(...xs),
    lo: Math.min(...inside),
    hi: Math.max(...inside),
    outliers: xs.filter((x) => x < q1 - fence || x > q3 + fence)
  }
}

// --- Distributions --------------------------------------------------------------

/** Standard normal CDF (Hart 1968 / West 2005, double precision). */
export function normCdf(z: number): number {
  const x = Math.abs(z)
  if (x > 37) return z > 0 ? 1 : 0
  const e = Math.exp((-x * x) / 2)
  let p: number
  if (x < 7.07106781186547) {
    const n = ((((((0.0352624965998911 * x + 0.700383064443688) * x + 6.37396220353165) * x + 33.912866078383) * x + 112.079291497871) * x + 221.213596169931) * x + 220.206867912376)
    const d = (((((((0.0883883476483184 * x + 1.75566716318264) * x + 16.064177579207) * x + 86.7807322029461) * x + 296.564248779674) * x + 637.333633378831) * x + 793.826512519948) * x + 440.413735824752)
    p = (e * n) / d
  } else {
    p = e / (x + 1 / (x + 2 / (x + 3 / (x + 4 / (x + 0.65))))) / 2.506628274631
  }
  return z > 0 ? 1 - p : p
}

/** Inverse standard normal (Acklam), refined by one Halley step. */
export function normInv(p: number): number {
  if (p <= 0) return -Infinity
  if (p >= 1) return Infinity
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239]
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572]
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416]
  const lo = 0.02425
  let x: number
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p))
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  } else if (p <= 1 - lo) {
    const q = p - 0.5
    const r = q * q
    x = ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p))
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  const e = normCdf(x) - p
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2)
  return x - u / (1 + (x * u) / 2)
}

export const normPdf = (x: number, mu = 0, sigma = 1): number => Math.exp(-0.5 * ((x - mu) / sigma) ** 2) / (sigma * Math.sqrt(2 * Math.PI))

function lnGamma(x: number): number {
  const g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.001208650973866179, -0.000005395239384953]
  let y = x
  const t = x + 5.5 - (x + 0.5) * Math.log(x + 5.5)
  let ser = 1.000000000190015
  for (const c of g) ser += c / ++y
  return -t + Math.log((2.5066282746310005 * ser) / x)
}

/** Regularized incomplete beta I_x(a, b) (Numerical Recipes betacf). */
export function incBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const front = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x))
  const cf = (aa: number, bb: number, xx: number): number => {
    const TINY = 1e-300
    let c = 1
    let d = 1 - ((aa + bb) * xx) / (aa + 1)
    d = 1 / (Math.abs(d) < TINY ? TINY : d)
    let h = d
    for (let m = 1; m <= 300; m++) {
      const m2 = 2 * m
      let num = (m * (bb - m) * xx) / ((aa + m2 - 1) * (aa + m2))
      d = 1 / (Math.abs(1 + num * d) < TINY ? TINY : 1 + num * d)
      c = Math.abs(1 + num / c) < TINY ? TINY : 1 + num / c
      h *= d * c
      num = (-(aa + m) * (aa + bb + m) * xx) / ((aa + m2) * (aa + m2 + 1))
      d = 1 / (Math.abs(1 + num * d) < TINY ? TINY : 1 + num * d)
      c = Math.abs(1 + num / c) < TINY ? TINY : 1 + num / c
      const del = d * c
      h *= del
      if (Math.abs(del - 1) < 1e-14) break
    }
    return h
  }
  return x < (a + 1) / (a + b + 2) ? (front * cf(a, b, x)) / a : 1 - (front * cf(b, a, 1 - x)) / b
}

/** Regularized lower incomplete gamma P(a, x). */
function incGamma(a: number, x: number): number {
  if (x <= 0) return 0
  const lg = lnGamma(a)
  if (x < a + 1) {
    let ap = a
    let del = 1 / a
    let s = del
    for (let n = 0; n < 500; n++) {
      del *= x / ++ap
      s += del
      if (Math.abs(del) < Math.abs(s) * 1e-15) break
    }
    return s * Math.exp(-x + a * Math.log(x) - lg)
  }
  let b = x + 1 - a
  let c = 1e300
  let d = 1 / b
  let h = d
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a)
    b += 2
    d = an * d + b
    d = 1 / (Math.abs(d) < 1e-300 ? 1e-300 : d)
    c = b + an / c
    if (Math.abs(c) < 1e-300) c = 1e-300
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 1e-15) break
  }
  return 1 - Math.exp(-x + a * Math.log(x) - lg) * h
}

/** Student t CDF. */
export function tCdf(t: number, df: number): number {
  const tail = 0.5 * incBeta(df / (df + t * t), df / 2, 0.5)
  return t > 0 ? 1 - tail : tail
}
/** Two-tailed p-value of a t statistic. */
export const tTwoTail = (t: number, df: number): number => incBeta(df / (df + t * t), df / 2, 0.5)

/** t quantile by bisection (monotone, plenty fast for a handful of calls). */
export function tInv(p: number, df: number): number {
  let lo = -1e4
  let hi = 1e4
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (tCdf(mid, df) < p) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/** Upper-tail p of an F statistic. */
export const fUpper = (f: number, d1: number, d2: number): number => (f <= 0 ? 1 : incBeta(d2 / (d2 + d1 * f), d2 / 2, d1 / 2))
/** Upper-tail p of a χ² statistic. */
export const chi2Upper = (x: number, df: number): number => 1 - incGamma(df / 2, x / 2)

// --- Relationships ----------------------------------------------------------------

/** Pairs where both values are numbers. */
export function pairs(xs: readonly number[], ys: readonly number[]): [number[], number[]] {
  const a: number[] = []
  const b: number[] = []
  xs.forEach((x, i) => {
    if (Number.isFinite(x) && Number.isFinite(ys[i])) {
      a.push(x)
      b.push(ys[i])
    }
  })
  return [a, b]
}

export function pearson(xs: readonly number[], ys: readonly number[]): number {
  const mx = mean(xs)
  const my = mean(ys)
  let sxy = 0
  let sxx = 0
  let syy = 0
  xs.forEach((x, i) => {
    sxy += (x - mx) * (ys[i] - my)
    sxx += (x - mx) ** 2
    syy += (ys[i] - my) ** 2
  })
  return sxy / Math.sqrt(sxx * syy)
}

/** Average ranks (ties share their mean rank). */
export function ranks(xs: readonly number[]): number[] {
  const idx = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0])
  const out = new Array<number>(xs.length)
  for (let i = 0; i < idx.length; ) {
    let j = i
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++
    for (let k = i; k <= j; k++) out[idx[k][1]] = (i + j) / 2 + 1
    i = j + 1
  }
  return out
}
export const spearman = (xs: readonly number[], ys: readonly number[]): number => pearson(ranks(xs), ranks(ys))

/** p-value of a correlation coefficient (t test with n − 2 df). */
export const corrP = (r: number, n: number): number => (n < 3 ? NaN : Math.abs(r) >= 1 ? 0 : tTwoTail((r * Math.sqrt(n - 2)) / Math.sqrt(1 - r * r), n - 2))

export interface Regression {
  slope: number
  intercept: number
  r: number
  r2: number
  /** Residual standard error. */
  se: number
  p: number
  n: number
  mx: number
  sxx: number
}

export function linReg(xs: readonly number[], ys: readonly number[]): Regression {
  const n = xs.length
  const mx = mean(xs)
  const my = mean(ys)
  let sxy = 0
  let sxx = 0
  xs.forEach((x, i) => {
    sxy += (x - mx) * (ys[i] - my)
    sxx += (x - mx) ** 2
  })
  const slope = sxy / sxx
  const intercept = my - slope * mx
  const sse = sum(xs.map((x, i) => (ys[i] - intercept - slope * x) ** 2))
  const r = pearson(xs, ys)
  return { slope, intercept, r, r2: r * r, se: Math.sqrt(sse / (n - 2)), p: corrP(r, n), n, mx, sxx }
}

/** Half-width of the prediction interval at x (new observation). */
export const predictionHalfWidth = (reg: Regression, x: number, conf = 0.95): number =>
  tInv(1 - (1 - conf) / 2, reg.n - 2) * reg.se * Math.sqrt(1 + 1 / reg.n + (x - reg.mx) ** 2 / reg.sxx)

// --- Tests ------------------------------------------------------------------------

export interface WelchResult {
  t: number
  df: number
  p: number
  diff: number
  ciLo: number
  ciHi: number
  /** Cohen's d with the pooled SD. */
  d: number
}

export function welch(a: readonly number[], b: readonly number[], conf = 0.95): WelchResult {
  const va = variance(a) / a.length
  const vb = variance(b) / b.length
  const diff = mean(a) - mean(b)
  const se = Math.sqrt(va + vb)
  const t = diff / se
  const df = (va + vb) ** 2 / (va ** 2 / (a.length - 1) + vb ** 2 / (b.length - 1))
  const crit = tInv(1 - (1 - conf) / 2, df)
  const pooled = Math.sqrt(((a.length - 1) * variance(a) + (b.length - 1) * variance(b)) / (a.length + b.length - 2))
  return { t, df, p: tTwoTail(t, df), diff, ciLo: diff - crit * se, ciHi: diff + crit * se, d: diff / pooled }
}

/** Mean ± t-based confidence half-width. */
export const meanCiHalf = (xs: readonly number[], conf = 0.95): number => (xs.length < 2 ? NaN : tInv(1 - (1 - conf) / 2, xs.length - 1) * (sd(xs) / Math.sqrt(xs.length)))

export interface AnovaResult {
  f: number
  df1: number
  df2: number
  p: number
  eta2: number
}

export function anova(groups: readonly (readonly number[])[]): AnovaResult {
  const all = groups.flat()
  const grand = mean(all)
  const ssb = sum(groups.map((g) => g.length * (mean(g) - grand) ** 2))
  const ssw = sum(groups.map((g) => sum(g.map((x) => (x - mean(g)) ** 2))))
  const df1 = groups.length - 1
  const df2 = all.length - groups.length
  const f = ssb / df1 / (ssw / df2)
  return { f, df1, df2, p: fUpper(f, df1, df2), eta2: ssb / (ssb + ssw) }
}

export interface TwoPropResult {
  pA: number
  pB: number
  /** Relative change of B over A. */
  lift: number
  z: number
  p: number
  ciLo: number
  ciHi: number
}

/** Pooled two-proportion z test; CI is for pB − pA (unpooled). */
export function twoProportion(nA: number, xA: number, nB: number, xB: number, conf = 0.95): TwoPropResult {
  const pA = xA / nA
  const pB = xB / nB
  const pool = (xA + xB) / (nA + nB)
  const z = (pB - pA) / Math.sqrt(pool * (1 - pool) * (1 / nA + 1 / nB))
  const se = Math.sqrt((pA * (1 - pA)) / nA + (pB * (1 - pB)) / nB)
  const crit = normInv(1 - (1 - conf) / 2)
  return { pA, pB, lift: (pB - pA) / pA, z, p: 2 * (1 - normCdf(Math.abs(z))), ciLo: pB - pA - crit * se, ciHi: pB - pA + crit * se }
}

/** Wilson score interval for a proportion. */
export function wilson(x: number, n: number, conf = 0.95): [number, number] {
  const z = normInv(1 - (1 - conf) / 2)
  const p = x / n
  const den = 1 + (z * z) / n
  const mid = (p + (z * z) / (2 * n)) / den
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den
  return [mid - half, mid + half]
}

export interface ChiResult {
  chi2: number
  df: number
  p: number
  cramerV: number
  expected: number[][]
}

export function chiSquare(table: readonly (readonly number[])[]): ChiResult {
  const rows = table.map(sum)
  const cols = table[0].map((_, j) => sum(table.map((r) => r[j])))
  const total = sum(rows)
  const expected = table.map((_, i) => cols.map((c) => (rows[i] * c) / total))
  let chi2 = 0
  table.forEach((r, i) => r.forEach((o, j) => (chi2 += (o - expected[i][j]) ** 2 / expected[i][j])))
  const df = (table.length - 1) * (cols.length - 1)
  return { chi2, df, p: chi2Upper(chi2, df), cramerV: Math.sqrt(chi2 / (total * Math.min(table.length - 1, cols.length - 1))), expected }
}

/** Survey sample size for a proportion, with finite population correction when N is given. */
export function sampleSize(conf: number, moe: number, p = 0.5, population = Infinity): number {
  const z = normInv(1 - (1 - conf) / 2)
  const n0 = (z * z * p * (1 - p)) / (moe * moe)
  return Math.ceil(Number.isFinite(population) && population > 0 ? n0 / (1 + (n0 - 1) / population) : n0)
}

/** Margin of error achieved by n respondents. */
export function marginOfError(conf: number, n: number, p = 0.5, population = Infinity): number {
  const z = normInv(1 - (1 - conf) / 2)
  const fpc = Number.isFinite(population) && population > 1 ? Math.sqrt((population - n) / (population - 1)) : 1
  return z * Math.sqrt((p * (1 - p)) / n) * fpc
}

// --- Series -------------------------------------------------------------------------

/** Trailing moving average; NaN until the window is full. */
export const movingAverage = (xs: readonly number[], w: number): number[] =>
  xs.map((_, i) => (i + 1 < w ? NaN : mean(xs.slice(i + 1 - w, i + 1))))

/** Sturges' rule bin count, at least 3. */
export const sturges = (n: number): number => Math.max(3, Math.ceil(Math.log2(n) + 1))

export interface Bin {
  lo: number
  hi: number
  count: number
}

/** Equal-width bins on round edges covering every value. */
export function histogram(xs: readonly number[], k = sturges(xs.length)): Bin[] {
  const min = Math.min(...xs)
  const max = Math.max(...xs)
  if (min === max) return [{ lo: min - 0.5, hi: max + 0.5, count: xs.length }]
  const step = niceStep((max - min) / k)
  const start = Math.floor(min / step) * step
  const n = Math.max(1, Math.ceil((max - start) / step + 1e-9))
  const bins: Bin[] = Array.from({ length: n }, (_, i) => ({ lo: start + i * step, hi: start + (i + 1) * step, count: 0 }))
  for (const x of xs) bins[Math.min(n - 1, Math.floor((x - start) / step + 1e-9))].count++
  return bins
}

/** 1, 2, 2.5, 5 × 10ⁿ at or above `raw`. */
export function niceStep(raw: number): number {
  if (!(raw > 0)) return 1
  const p = 10 ** Math.floor(Math.log10(raw))
  const f = raw / p
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p
}
