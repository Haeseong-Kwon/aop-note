import ICAL from 'ical.js'

/** One occurrence of a calendar event (recurring series are expanded). */
export interface IcsEvent {
  /** Stable per occurrence: `${uid}|${start}`. */
  id: string
  uid: string
  title: string
  location: string
  description: string
  /** ISO instant; for all-day events, local midnight of the day. */
  start: string
  /** Exclusive end (ISO). */
  end: string
  all_day: boolean
}

const MAX_OCCURRENCES = 5_000 // per feed — guards against pathological RRULEs

/** Wall-clock time in an IANA zone → instant, via Intl (for TZIDs without a VTIMEZONE). */
function zonedToDate(t: ICAL.Time, tzid: string): Date | null {
  let format: Intl.DateTimeFormat
  try {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone: tzid,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  } catch {
    return null // not an IANA name
  }
  const offsetAt = (ms: number): number => {
    const p = Object.fromEntries(format.formatToParts(new Date(ms)).map((x) => [x.type, Number(x.value)]))
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - ms
  }
  const wall = Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second)
  // Two passes settle DST boundaries.
  let ms = wall - offsetAt(wall)
  ms = wall - offsetAt(ms)
  return new Date(ms)
}

function toDate(t: ICAL.Time): Date {
  if (t.isDate) return new Date(t.year, t.month - 1, t.day) // all-day: local calendar day
  // ical.js keeps an unresolved TZID string on the Time (untyped); the NY case in ics.check covers it.
  const tzid = (t as ICAL.Time & { timezone?: string }).timezone ?? ''
  const known = !tzid || tzid === 'Z' || tzid === 'UTC' || ICAL.TimezoneService.has(tzid)
  if (!known) {
    const zoned = zonedToDate(t, tzid)
    if (zoned) return zoned
  }
  return t.toJSDate()
}

const text = (v: unknown): string => (typeof v === 'string' ? v : '')

/**
 * Parse an iCalendar feed into the occurrences overlapping [from, to).
 * Handles VTIMEZONE, RRULE / EXDATE / RDATE, RECURRENCE-ID overrides and CANCELLED.
 */
export function parseIcs(feed: string, from: Date, to: Date): IcsEvent[] {
  if (!/BEGIN:VCALENDAR/.test(feed)) throw new Error('iCal 형식이 아닙니다. 캘린더의 "iCal 형식의 비공개 주소"인지 확인하세요.')
  const root = new ICAL.Component(ICAL.parse(feed))
  for (const tz of root.getAllSubcomponents('vtimezone')) {
    const zone = new ICAL.Timezone(tz)
    if (!ICAL.TimezoneService.has(zone.tzid)) ICAL.TimezoneService.register(zone)
  }

  const masters = new Map<string, ICAL.Event>()
  const overrides: ICAL.Event[] = []
  for (const vevent of root.getAllSubcomponents('vevent')) {
    const event = new ICAL.Event(vevent)
    if (event.isRecurrenceException()) overrides.push(event)
    else masters.set(event.uid, event)
  }
  const orphans: ICAL.Event[] = []
  for (const o of overrides) {
    const master = masters.get(o.uid)
    if (master) master.relateException(o)
    else orphans.push(o) // an edited instance whose series isn't in the feed
  }

  const out: IcsEvent[] = []
  const push = (item: ICAL.Event, startT: ICAL.Time, endT: ICAL.Time): void => {
    if (text(item.component.getFirstPropertyValue('status')).toUpperCase() === 'CANCELLED') return
    const start = toDate(startT)
    const end = endT ? toDate(endT) : start
    if (end <= from || start >= to) return
    const startIso = start.toISOString()
    out.push({
      id: `${item.uid}|${startIso}`,
      uid: item.uid,
      title: item.summary || '(제목 없음)',
      location: text(item.location),
      description: text(item.description),
      start: startIso,
      end: end.toISOString(),
      all_day: startT.isDate
    })
  }

  for (const event of [...masters.values(), ...orphans]) {
    if (!event.isRecurring()) {
      push(event, event.startDate, event.endDate)
      continue
    }
    const it = event.iterator()
    for (let next = it.next(), n = 0; next && n < MAX_OCCURRENCES; next = it.next(), n++) {
      const details = event.getOccurrenceDetails(next)
      if (toDate(details.startDate) >= to) break
      push(details.item, details.startDate, details.endDate)
    }
  }

  return out.sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title))
}
