import { formatDateInput } from './format'
import type { Priority, Recurrence } from '@shared/types'

export interface QuickInput {
  /** Title with the recognised date / priority words removed. */
  title: string
  /** Local YYYY-MM-DD, or null when no date word was found. */
  due: string | null
  priority: Priority | null
  recurrence: Recurrence | null
  /** Local 'YYYY-MM-DDTHH:MM' reminder time, or null. */
  remindAt: string | null
}

const WEEKDAY: Record<string, number> = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 }
const RELATIVE_DAY: Record<string, number> = { 오늘: 0, 내일: 1, 모레: 2, 글피: 3 }

const addDays = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
/** Monday of the week containing d (weeks start on Monday). */
const mondayOf = (d: Date): Date => addDays(d, -((d.getDay() + 6) % 7))
const offsetFromMonday = (weekday: string): number => (WEEKDAY[weekday] + 6) % 7

/** A calendar date this year, or next year if it has already passed. Null if impossible (13/40). */
function monthDay(now: Date, month: number, day: number): Date | null {
  const d = new Date(now.getFullYear(), month - 1, day)
  if (d.getMonth() !== month - 1 || d.getDate() !== day) return null
  return d < addDays(now, 0) ? new Date(now.getFullYear() + 1, month - 1, day) : d
}

/** The next date with this day-of-month (today included), skipping months too short for it. */
function dayOfMonth(now: Date, day: number): Date | null {
  if (day < 1 || day > 31) return null
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, day)
    if (d.getDate() === day && d >= addDays(now, 0)) return d
  }
  return null
}

const RECURRENCE: Record<string, Recurrence> = {
  매일: 'daily',
  평일: 'weekdays',
  평일마다: 'weekdays',
  매주: 'weekly',
  매월: 'monthly',
  매달: 'monthly'
}

interface DateRule {
  pattern: string
  resolve: (m: RegExpMatchArray, now: Date) => Date | null
}

// Most specific first; the first rule that matches and resolves wins.
const RULES: DateRule[] = [
  {
    pattern: '다음 ?주 ?([월화수목금토일])(?:요일)?',
    resolve: (m, now) => addDays(mondayOf(now), 7 + offsetFromMonday(m[1]))
  },
  {
    pattern: '이번 ?주 ?([월화수목금토일])(?:요일)?',
    resolve: (m, now) => addDays(mondayOf(now), offsetFromMonday(m[1]))
  },
  { pattern: '다음 ?주', resolve: (_m, now) => addDays(mondayOf(now), 7) },
  { pattern: '(\\d{1,3})일 ?(?:후|뒤)', resolve: (m, now) => addDays(now, Number(m[1])) },
  { pattern: '(\\d{1,2})월 ?(\\d{1,2})일', resolve: (m, now) => monthDay(now, Number(m[1]), Number(m[2])) },
  { pattern: '(\\d{1,2})/(\\d{1,2})', resolve: (m, now) => monthDay(now, Number(m[1]), Number(m[2])) },
  { pattern: '(\\d{1,2})일', resolve: (m, now) => dayOfMonth(now, Number(m[1])) },
  {
    pattern: '([월화수목금토일])요일',
    resolve: (m, now) => addDays(now, (WEEKDAY[m[1]] - now.getDay() + 7) % 7)
  },
  { pattern: '(오늘|내일|모레|글피)', resolve: (m, now) => addDays(now, RELATIVE_DAY[m[1]]) }
]

interface TimeRule {
  pattern: string
  /** Groups: meridiem word (optional), hour, minute (optional), "반" (optional). */
  groups: [number, number, number, number]
}

const TIME_RULES: TimeRule[] = [
  { pattern: '(?:(오전|오후|아침|저녁|밤) ?)?(\\d{1,2})시(?: ?(\\d{1,2})분| ?(반))?', groups: [1, 2, 3, 4] },
  { pattern: '(?:(오전|오후|아침|저녁|밤) ?)?(\\d{1,2}):(\\d{2})', groups: [1, 2, 3, 0] }
]

const PM_WORDS = new Set(['오후', '저녁', '밤'])
const AM_WORDS = new Set(['오전', '아침'])

/**
 * 24h hour/minute, or null if impossible. A bare 1–6 means afternoon (nobody books 3 a.m.),
 * unless written with a leading zero ("05:30"), which is already a 24h clock.
 */
function toClock(meridiem: string | undefined, hourText: string, minute: number): [number, number] | null {
  const hour = Number(hourText)
  if (hour > 23 || minute > 59) return null
  let h = hour
  if (meridiem && PM_WORDS.has(meridiem) && h < 12) h += 12
  else if (meridiem && AM_WORDS.has(meridiem) && h === 12) h = 0
  else if (!meridiem && !hourText.startsWith('0') && h >= 1 && h <= 6) h += 12
  return [h, minute]
}

const pad2 = (n: number): string => String(n).padStart(2, '0')

// A token is a whole word: preceded by start/space, followed by space/end.
// Dates may carry a trailing "까지" ("금요일까지").
const token = (body: string, suffix = ''): RegExp => new RegExp(`(?<=^|\\s)(?:${body})${suffix}(?=\\s|$)`)

const squash = (s: string): string => s.replace(/\s+/g, ' ').trim()

/**
 * Pull a due date ("내일", "금요일까지", "다음주 수", "10/3", "3일 후") and a priority
 * ("!", "!!", "!!!") and a repeat rule ("매일", "평일마다", "매주", "매월") out of a
 * quick-capture title. A title that would end up empty
 * is left untouched, so typing just "내일" still creates a task called "내일".
 */
export function parseQuickInput(text: string, now = new Date()): QuickInput {
  let title = text
  let due: string | null = null
  let priority: Priority | null = null
  let recurrence: Recurrence | null = null
  let remindAt: string | null = null

  for (const rule of RULES) {
    const m = title.match(token(rule.pattern, '(?:까지)?'))
    if (!m || m.index === undefined) continue
    const date = rule.resolve(m, now)
    if (!date) continue
    due = formatDateInput(date)
    title = title.slice(0, m.index) + ' ' + title.slice(m.index + m[0].length)
    break
  }

  for (const rule of TIME_RULES) {
    const m = title.match(token(rule.pattern))
    if (!m || m.index === undefined) continue
    const [gMeridiem, gHour, gMinute, gHalf] = rule.groups
    const minute = gHalf && m[gHalf] ? 30 : Number(m[gMinute] ?? 0)
    const clock = toClock(m[gMeridiem], m[gHour], minute)
    if (!clock) continue
    // No date given: today, or tomorrow if that time has already passed.
    let day = due ? new Date(`${due}T00:00:00`) : addDays(now, 0)
    if (!due && clock[0] * 60 + clock[1] <= now.getHours() * 60 + now.getMinutes()) day = addDays(day, 1)
    due = formatDateInput(day)
    remindAt = `${due}T${pad2(clock[0])}:${pad2(clock[1])}`
    title = title.slice(0, m.index) + ' ' + title.slice(m.index + m[0].length)
    break
  }

  const bang = title.match(token('(!{1,3})'))
  if (bang && bang.index !== undefined) {
    priority = bang[1].length as Priority
    title = title.slice(0, bang.index) + ' ' + title.slice(bang.index + bang[0].length)
  }

  const repeat = title.match(token(Object.keys(RECURRENCE).sort((a, b) => b.length - a.length).join('|')))
  if (repeat && repeat.index !== undefined) {
    recurrence = RECURRENCE[repeat[0]]
    title = title.slice(0, repeat.index) + ' ' + title.slice(repeat.index + repeat[0].length)
    // A routine needs a first occurrence to show up anywhere; start today.
    due ??= formatDateInput(now)
  }

  title = squash(title)
  if (!title) return { title: squash(text), due: null, priority: null, recurrence: null, remindAt: null }
  return { title, due, priority, recurrence, remindAt }
}
