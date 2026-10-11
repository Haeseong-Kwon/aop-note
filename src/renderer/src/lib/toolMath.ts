/** Pure math behind the 도구 (tools) view. No DOM, so lib/check.ts can assert on it. */

// --- Calculator: a small recursive-descent parser (no eval) -------------------

const FUNCS: Record<string, (x: number) => number> = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  ln: Math.log,
  log: Math.log10,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan
}
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E }

/**
 * Evaluates + - * / % ^ ( ) with unary minus, functions (sqrt(), log() …), pi / e,
 * thousands separators ("1,000") and × ÷ symbols. A trailing "%" on a number means /100.
 * Throws on malformed input.
 */
export function evaluate(input: string): number {
  const src = input.replace(/,/g, '').replace(/×/g, '*').replace(/÷/g, '/').replace(/\s+/g, '').toLowerCase()
  let i = 0
  const peek = (): string => src[i] ?? ''
  const fail = (): never => {
    throw new Error('수식이 올바르지 않습니다')
  }

  const primary = (): number => {
    if (peek() === '(') {
      i++
      const v = expr()
      if (peek() !== ')') fail()
      i++
      return v
    }
    const num = /^\d*\.?\d+(e[+-]?\d+)?/.exec(src.slice(i))
    if (num) {
      i += num[0].length
      return Number(num[0])
    }
    const word = /^[a-z]+/.exec(src.slice(i))
    if (word) {
      i += word[0].length
      if (word[0] in CONSTS) return CONSTS[word[0]]
      const fn = FUNCS[word[0]] ?? fail()
      if (peek() !== '(') fail()
      return fn(primary())
    }
    return fail()
  }
  const postfix = (): number => {
    let v = primary()
    while (peek() === '%' && !/[\d(a-z.]/.test(src[i + 1] ?? '')) {
      i++
      v /= 100
    }
    return v
  }
  const unary = (): number => {
    if (peek() === '-') {
      i++
      return -unary()
    }
    if (peek() === '+') {
      i++
      return unary()
    }
    return power()
  }
  const power = (): number => {
    const base = postfix()
    if (peek() === '^') {
      i++
      return base ** unary() // right-associative
    }
    return base
  }
  const term = (): number => {
    let v = unary()
    for (;;) {
      const op = peek()
      if (op !== '*' && op !== '/' && op !== '%') return v
      i++
      const r = unary()
      v = op === '*' ? v * r : op === '/' ? v / r : v % r
    }
  }
  const expr = (): number => {
    let v = term()
    for (;;) {
      const op = peek()
      if (op !== '+' && op !== '-') return v
      i++
      v = op === '+' ? v + term() : v - term()
    }
  }

  if (!src) fail()
  const v = expr()
  if (i !== src.length || !Number.isFinite(v)) fail()
  return v
}

// --- Finance -----------------------------------------------------------------

export type RepayMethod = 'annuity' | 'equal-principal' | 'bullet'

export interface LoanRow {
  month: number
  payment: number
  principal: number
  interest: number
  balance: number
}

/** Monthly schedule for a loan at an annual rate (%), over n months. */
export function loanSchedule(amount: number, annualRatePct: number, months: number, method: RepayMethod): LoanRow[] {
  const n = Math.max(0, Math.floor(months))
  const r = annualRatePct / 100 / 12
  const rows: LoanRow[] = []
  let balance = amount
  const annuity = r === 0 ? amount / n : (amount * r) / (1 - (1 + r) ** -n)
  for (let m = 1; m <= n; m++) {
    const interest = balance * r
    const principal =
      method === 'annuity' ? annuity - interest : method === 'equal-principal' ? amount / n : m === n ? balance : 0
    balance = Math.max(0, balance - principal)
    rows.push({ month: m, payment: principal + interest, principal, interest, balance })
  }
  return rows
}

/** Net present value; cashflows[0] is at t=0 (usually negative). */
export const npv = (ratePct: number, cashflows: number[]): number =>
  cashflows.reduce((sum, cf, t) => sum + cf / (1 + ratePct / 100) ** t, 0)

/** Internal rate of return in %, by bisection; null when the cash flows never change sign. */
export function irr(cashflows: number[]): number | null {
  if (!cashflows.some((c) => c < 0) || !cashflows.some((c) => c > 0)) return null
  let lo = -99.99
  let hi = 1000
  let fLo = npv(lo, cashflows)
  if (fLo * npv(hi, cashflows) > 0) return null
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2
    const f = npv(mid, cashflows)
    if (Math.abs(f) < 1e-9) return mid
    if (f * fLo < 0) hi = mid
    else {
      lo = mid
      fLo = f
    }
  }
  return (lo + hi) / 2
}

/** Future value of a principal plus monthly contributions, compounded monthly. */
export function futureValue(principal: number, monthly: number, annualRatePct: number, years: number): number {
  const r = annualRatePct / 100 / 12
  const n = Math.round(years * 12)
  if (r === 0) return principal + monthly * n
  return principal * (1 + r) ** n + monthly * (((1 + r) ** n - 1) / r)
}

/** Compound annual growth rate in %. */
export const cagr = (start: number, end: number, years: number): number => ((end / start) ** (1 / years) - 1) * 100

/** Break-even units = fixed / (price − variable); null when each unit loses money. */
export const breakEvenUnits = (fixed: number, price: number, variable: number): number | null =>
  price > variable ? fixed / (price - variable) : null

/** Korean VAT (default 10%): split a total, or add tax to a supply value. */
export function vat(amount: number, from: 'total' | 'supply', ratePct = 10): { supply: number; tax: number; total: number } {
  const k = ratePct / 100
  const supply = from === 'total' ? Math.round(amount / (1 + k)) : amount
  const total = from === 'total' ? amount : Math.round(amount * (1 + k))
  return { supply, tax: total - supply, total }
}

// --- Project management ------------------------------------------------------

/** PERT three-point estimate: expected time and standard deviation. */
export const pert = (o: number, m: number, p: number): { expected: number; sd: number } => ({
  expected: (o + 4 * m + p) / 6,
  sd: (p - o) / 6
})

/** RICE = reach × impact × confidence(%) / effort. */
export const rice = (reach: number, impact: number, confidencePct: number, effort: number): number =>
  effort > 0 ? (reach * impact * (confidencePct / 100)) / effort : 0

// --- Dates -------------------------------------------------------------------

const DAY_MS = 86_400_000
/** 'YYYY-MM-DD' → local midnight. */
export const parseDay = (day: string): Date => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const toDayKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Calendar days from a to b (b − a), DST-safe. */
export const daysBetween = (a: string, b: string): number => Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / DAY_MS)

const isWeekend = (d: Date): boolean => d.getDay() === 0 || d.getDay() === 6

/** Mon–Fri days in [a, b] inclusive (0 when b < a), skipping `holidays` ('YYYY-MM-DD'). */
export function businessDaysBetween(a: string, b: string, holidays: ReadonlySet<string> = new Set()): number {
  let count = 0
  for (let d = parseDay(a); d <= parseDay(b); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    if (!isWeekend(d) && !holidays.has(toDayKey(d))) count++
  }
  return count
}

/** The day n business days after (or before, n < 0) `from`. */
export function addBusinessDays(from: string, n: number, holidays: ReadonlySet<string> = new Set()): string {
  const step = n < 0 ? -1 : 1
  let d = parseDay(from)
  for (let left = Math.abs(n); left > 0; ) {
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + step)
    if (!isWeekend(d) && !holidays.has(toDayKey(d))) left--
  }
  return toDayKey(d)
}

export const addDays = (from: string, n: number): string => {
  const d = parseDay(from)
  return toDayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n))
}

// --- Pay ---------------------------------------------------------------------

/** Monthly paid hours incl. 주휴 (15h+/week), rounded up as payroll does: 40h/week → 209h. */
export const monthlyHours = (weeklyHours: number): number => {
  const paidWeekly = weeklyHours + (weeklyHours >= 15 ? Math.min(8, weeklyHours / 5) : 0)
  return Math.ceil((paidWeekly * 365) / 7 / 12)
}

// --- Formatting --------------------------------------------------------------

/** Parses "1,234.5" (or "") from an input; NaN when not a number. */
export const num = (s: string): number => (s.trim() === '' ? NaN : Number(s.replace(/,/g, '')))

/** Grouped number with up to `digits` decimals; '—' for NaN / ±Infinity. */
export const fmt = (n: number, digits = 0): string =>
  Number.isFinite(n) ? n.toLocaleString('ko-KR', { maximumFractionDigits: digits }) : '—'

/** 123456789 → '1억 2,345만 6,789원' (for big won amounts). */
export function koreanWon(n: number): string {
  if (!Number.isFinite(n)) return '—'
  const sign = n < 0 ? '-' : ''
  let v = Math.round(Math.abs(n))
  const parts: string[] = []
  for (const [unit, size] of [
    ['조', 1e12],
    ['억', 1e8],
    ['만', 1e4]
  ] as const) {
    const q = Math.floor(v / size)
    if (q) parts.push(`${q.toLocaleString('ko-KR')}${unit}`)
    v -= q * size
  }
  if (v || parts.length === 0) parts.push(v.toLocaleString('ko-KR'))
  return `${sign}${parts.join(' ')}원`
}

/** Live-typing format for number inputs: keeps '-', one '.', groups the integer part ("1234.5" → "1,234.5"). */
export function groupDigits(raw: string): string {
  const neg = raw.trim().startsWith('-')
  const clean = raw.replace(/[^\d.]/g, '')
  const dot = clean.indexOf('.')
  const int = (dot < 0 ? clean : clean.slice(0, dot)).replace(/^0+(?=\d)/, '')
  const frac = dot < 0 ? '' : '.' + clean.slice(dot + 1).replace(/\./g, '')
  return `${neg ? '-' : ''}${int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${frac}`
}

// --- Korean amount wording (계약서·영수증 표기) ----------------------------------

const HANGUL_DIGITS = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구']
const HANJA_DIGITS = ['', '壹', '貳', '參', '肆', '伍', '陸', '柒', '捌', '玖']
const SMALL_UNITS = { hangul: ['천', '백', '십', ''], hanja: ['阡', '佰', '拾', ''] }
const BIG_UNITS = { hangul: ['', '만', '억', '조', '경'], hanja: ['', '萬', '億', '兆', '京'] }

/**
 * 123456789 → '일억이천삼백사십오만육천칠백팔십구' (hangul) or the 갖은자 form (hanja).
 * Every 1 is written out (일백, 일천) so the figure can't be altered. Whole non-negative amounts only.
 */
export function amountInWords(n: number, script: 'hangul' | 'hanja'): string {
  if (!Number.isFinite(n) || n < 0) return ''
  const v = Math.floor(n)
  if (v === 0) return script === 'hangul' ? '영' : '零'
  const digits = script === 'hangul' ? HANGUL_DIGITS : HANJA_DIGITS
  const s = String(v).padStart(Math.ceil(String(v).length / 4) * 4, '0')
  const groups = s.match(/\d{4}/g) ?? []
  return groups
    .map((g, i) => {
      const words = [...g].map((d, j) => (d === '0' ? '' : digits[+d] + SMALL_UNITS[script][j])).join('')
      return words ? words + BIG_UNITS[script][groups.length - 1 - i] : ''
    })
    .join('')
}

// --- Tax / payroll -------------------------------------------------------------------

const floor10 = (x: number): number => Math.floor(x / 10) * 10

/** Withholding on freelance pay: 3.3% (사업소득 3% + 지방 0.3%) or 8.8% (기타소득 8% + 0.8%), taxes cut to 10원. */
export function withholding(gross: number, incomeRatePct: 3 | 8): { gross: number; income: number; local: number; net: number } {
  const income = floor10((gross * incomeRatePct) / 100)
  const local = floor10(income / 10)
  return { gross, income, local, net: gross - income - local }
}

/**
 * The gross that leaves `net` after withholding. Truncation makes a small range of grosses
 * give the same net; the largest is returned (967,000 → 1,000,000, not 999,980).
 */
export function grossFromNet(net: number, incomeRatePct: 3 | 8): number {
  let g = Math.floor(net / (1 - (incomeRatePct * 1.1) / 100))
  while (withholding(g, incomeRatePct).net < net) g++
  while (g > 0 && withholding(g - 1, incomeRatePct).net >= net) g--
  // Taxes step every 10원 of tax, so exact matches recur a few hundred 원 apart at most.
  let best = g
  for (let x = g; x <= g + 400; x++) if (withholding(x, incomeRatePct).net === net) best = x
  return best
}

/** Whole months from a to b (a ≤ b), counting a month only once its day-of-month is reached. */
export function monthsBetween(a: string, b: string): number {
  const x = parseDay(a)
  const y = parseDay(b)
  return (y.getFullYear() - x.getFullYear()) * 12 + (y.getMonth() - x.getMonth()) - (y.getDate() < x.getDate() ? 1 : 0)
}

/**
 * 근로기준법 제60조 annual leave on `asOf`, by hire date (입사일 기준, 출근율 80% 이상 가정).
 * Under 1 year: 1 day per full month (max 11). From year 1: 15 days, +1 every 2 years, max 25.
 */
export function annualLeave(hire: string, asOf: string): { years: number; months: number; days: number; firstYear: boolean } {
  const months = Math.max(0, monthsBetween(hire, asOf))
  const years = Math.floor(months / 12)
  if (years < 1) return { years, months, days: Math.min(11, months), firstYear: true }
  return { years, months, days: Math.min(25, 15 + Math.floor((years - 1) / 2)), firstYear: false }
}

export const addMonths = (day: string, n: number): string => {
  const d = parseDay(day)
  const t = new Date(d.getFullYear(), d.getMonth() + n, 1)
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()
  return toDayKey(new Date(t.getFullYear(), t.getMonth(), Math.min(d.getDate(), last)))
}

/**
 * 퇴직금 estimate: 1일 평균임금 × 30 × 재직일수 ÷ 365. `end` is the day after the last working day.
 * Average wage = (last 3 months' pay + 3/12 of annual bonus and leave pay) ÷ days in those 3 months.
 */
export function severance(start: string, end: string, pay3m: number, annualBonus = 0, leavePay = 0): { serviceDays: number; dailyWage: number; amount: number; eligible: boolean } {
  const serviceDays = daysBetween(start, end)
  const dailyWage = (pay3m + (annualBonus * 3) / 12 + (leavePay * 3) / 12) / daysBetween(addMonths(end, -3), end)
  return { serviceDays, dailyWage, amount: Math.floor((dailyWage * 30 * serviceDays) / 365), eligible: serviceDays >= 365 }
}

/** Minutes worked between 'HH:MM' times (overnight if end ≤ start) minus a break; null when incomplete. */
export function workedMinutes(start: string, end: string, breakMin: number): number | null {
  const m = (t: string): number | null => {
    const hit = /^(\d{1,2}):(\d{2})$/.exec(t)
    return hit ? +hit[1] * 60 + +hit[2] : null
  }
  const s = m(start)
  const e = m(end)
  if (s === null || e === null) return null
  return Math.max(0, (e > s ? e - s : e + 1440 - s) - (breakMin || 0))
}

// --- Text -----------------------------------------------------------------------------

/** Password from the chosen character sets using crypto randomness; at least one char from each set. */
export function makePassword(length: number, sets: { upper: boolean; digits: boolean; symbols: boolean }, avoidAmbiguous: boolean, rand: (n: number) => number): string {
  const strip = (s: string): string => (avoidAmbiguous ? s.replace(/[Il1O0o|`'"]/g, '') : s)
  const pools = [strip('abcdefghijklmnopqrstuvwxyz'), sets.upper && strip('ABCDEFGHIJKLMNOPQRSTUVWXYZ'), sets.digits && strip('0123456789'), sets.symbols && strip('!@#$%^&*-_=+?')].filter(
    (p): p is string => Boolean(p)
  )
  const all = pools.join('')
  const n = Math.max(length, pools.length)
  const chars = [...pools.map((p) => p[rand(p.length)]), ...Array.from({ length: n - pools.length }, () => all[rand(all.length)])]
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rand(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

/** Entropy in bits for a random string of `length` drawn from `poolSize` symbols. */
export const entropyBits = (length: number, poolSize: number): number => length * Math.log2(Math.max(1, poolSize))
