import type { Schedule, TaskWithContext } from '@shared/types'

// AOP Note schedules (+ open tasks with a due date) as an iCalendar file that Google
// Calendar, Apple Calendar and Outlook import. RFC 5545: CRLF lines folded at 75 octets,
// text escaped, all-day DTEND exclusive, timed events in UTC.

const CRLF = '\r\n'
const MAX_OCTETS = 75

const escapeText = (s: string): string => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** Fold a content line at 75 octets without splitting a UTF-8 character. */
export function foldLine(line: string): string {
  const out: string[] = []
  let current = ''
  let octets = 0
  for (const ch of line) {
    const size = Buffer.byteLength(ch)
    const limit = out.length === 0 ? MAX_OCTETS : MAX_OCTETS - 1 // continuation lines start with a space
    if (octets + size > limit) {
      out.push(current)
      current = ''
      octets = 0
    }
    current += ch
    octets += size
  }
  out.push(current)
  return out.join(`${CRLF} `)
}

const utc = (iso: string): string => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const day = (ymd: string): string => ymd.replace(/-/g, '')
/** 'YYYY-MM-DD' + 1 day (all-day DTEND is exclusive). */
const nextDay = (ymd: string): string => {
  const [y, m, d] = ymd.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + 1))
  return next.toISOString().slice(0, 10).replace(/-/g, '')
}
const localDay = (iso: string): string => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function event(uid: string, stamp: string, props: string[]): string[] {
  return ['BEGIN:VEVENT', `UID:${uid}@aop-note`, `DTSTAMP:${stamp}`, ...props, 'END:VEVENT']
}

export function buildIcs(schedules: Schedule[], tasks: TaskWithContext[], now = new Date()): string {
  const stamp = utc(now.toISOString())
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AOP Note//KO', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:AOP Note']
  for (const s of schedules) {
    const when = s.all_day
      ? [`DTSTART;VALUE=DATE:${day(s.start_day)}`, `DTEND;VALUE=DATE:${nextDay(s.end_day)}`]
      : [`DTSTART:${utc(s.start)}`, `DTEND:${utc(s.end)}`]
    lines.push(
      ...event(s.id, stamp, [
        ...when,
        `SUMMARY:${escapeText(s.title)}`,
        ...(s.location ? [`LOCATION:${escapeText(s.location)}`] : []),
        ...(s.note ? [`DESCRIPTION:${escapeText(s.note)}`] : []),
        `LAST-MODIFIED:${utc(s.updated_at)}`
      ])
    )
  }
  for (const t of tasks) {
    if (!t.due_date || t.status === 'done') continue
    const d = localDay(t.due_date)
    lines.push(
      ...event(`task-${t.id}`, stamp, [
        `DTSTART;VALUE=DATE:${day(d)}`,
        `DTEND;VALUE=DATE:${nextDay(d)}`,
        `SUMMARY:${escapeText(`[할 일] ${t.title}`)}`,
        `DESCRIPTION:${escapeText(`${t.workspace_name} · ${t.category_name}`)}`,
        'TRANSP:TRANSPARENT'
      ])
    )
  }
  lines.push('END:VCALENDAR')
  return lines.map(foldLine).join(CRLF) + CRLF
}
