import assert from 'node:assert'
import { readFileSync } from 'fs'
import { normalizeFeedUrl, addCalendar, listCalendars, removeCalendar, eventsBetween, syncCalendar, calendarsPath } from './calendars'

// A trimmed Google-style feed (see ics.check.ts for the parser's full coverage).
const FEED = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'DTSTART:20260929T060000Z',
  'DTEND:20260929T063000Z',
  'UID:call@google.com',
  'SUMMARY:고객 통화',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;VALUE=DATE:20261001',
  'DTEND;VALUE=DATE:20261002',
  'UID:holiday@google.com',
  'SUMMARY:개천절 전날 휴가',
  'END:VEVENT',
  'END:VCALENDAR'
].join('\r\n')

const SECRET = 'https://calendar.google.com/calendar/ical/me%40gmail.com/private-secret-token/basic.ics'
const ok = async (): Promise<string> => FEED
const now = new Date('2026-09-25T00:00:00Z')

async function main(): Promise<void> {
  // URLs: webcal → https, http and junk refused (the address is a credential).
  assert.equal(normalizeFeedUrl(' webcal://p01-calendars.icloud.com/x.ics '), 'https://p01-calendars.icloud.com/x.ics')
  assert.throws(() => normalizeFeedUrl('http://example.com/a.ics'), /https/)
  assert.throws(() => normalizeFeedUrl('비공개 주소'), /주소/)

  // A feed that can't be read is refused up front and nothing is saved.
  await assert.rejects(addCalendar({ name: '깨진 것', url: SECRET, color: '#f00' }, { fetcher: async () => '<html>404</html>', now }), /iCal/)
  assert.equal(listCalendars().length, 0)

  const cal = await addCalendar({ name: '업무', url: SECRET, color: '#3b6ea5' }, { fetcher: ok, now })
  assert.equal(cal.event_count, 2)
  assert.ok(cal.last_sync)
  assert.ok(!('url' in cal), 'the secret address never leaves main')
  assert.ok(!readFileSync(calendarsPath(), 'utf8').includes('private-secret-token'), 'stored encrypted, not in plain text')

  const week = eventsBetween('2026-09-28T00:00:00Z', '2026-10-05T00:00:00Z')
  assert.deepEqual(week.map((e) => [e.title, e.calendar_name, e.color, e.all_day]), [
    ['고객 통화', '업무', '#3b6ea5', false],
    ['개천절 전날 휴가', '업무', '#3b6ea5', true]
  ])
  assert.deepEqual(eventsBetween('2026-10-02T00:00:00Z', '2026-10-03T00:00:00Z').length, 0, 'all-day end is exclusive')

  // A later sync failure keeps the last good events and records the error.
  const failed = await syncCalendar(cal.id, { fetcher: async () => { throw new Error('offline') }, now })
  assert.match(failed.last_error ?? '', /offline/)
  assert.equal(eventsBetween('2026-09-28T00:00:00Z', '2026-10-05T00:00:00Z').length, 2)
  const recovered = await syncCalendar(cal.id, { fetcher: ok, now })
  assert.equal(recovered.last_error, null)

  removeCalendar(cal.id)
  assert.equal(listCalendars().length, 0)
  assert.equal(eventsBetween('2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z').length, 0, 'its events go with it')

  console.log('calendars: all assertions passed')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
