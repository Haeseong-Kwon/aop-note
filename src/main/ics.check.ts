import assert from 'node:assert'
import { parseIcs } from './ics'

// Shaped like Google Calendar's "secret address in iCal format" feed.
const FEED = [
  'BEGIN:VCALENDAR',
  'PRODID:-//Google Inc//Google Calendar 70.9054//EN',
  'VERSION:2.0',
  'X-WR-CALNAME:업무',
  'BEGIN:VTIMEZONE',
  'TZID:Asia/Seoul',
  'X-LIC-LOCATION:Asia/Seoul',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0900',
  'TZOFFSETTO:+0900',
  'TZNAME:KST',
  'DTSTART:19700101T000000',
  'END:STANDARD',
  'END:VTIMEZONE',
  'BEGIN:VEVENT',
  'DTSTART;TZID=Asia/Seoul:20260928T100000',
  'DTEND;TZID=Asia/Seoul:20260928T110000',
  'RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=4',
  'EXDATE;TZID=Asia/Seoul:20261005T100000',
  'UID:weekly@google.com',
  'SUMMARY:주간 회의',
  'LOCATION:본사 3층',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;TZID=Asia/Seoul:20261012T140000',
  'DTEND;TZID=Asia/Seoul:20261012T150000',
  'RECURRENCE-ID;TZID=Asia/Seoul:20261012T100000',
  'UID:weekly@google.com',
  'SUMMARY:주간 회의 (시간 변경)',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;VALUE=DATE:20260930',
  'DTEND;VALUE=DATE:20261002',
  'UID:allday@google.com',
  'SUMMARY:워크숍',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART:20260929T060000Z',
  'DTEND:20260929T063000Z',
  'UID:utc@google.com',
  'SUMMARY:고객 통화',
  'DESCRIPTION:첫 줄\\n둘째 줄은 길어서 접',
  ' 혀 있음',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;TZID=America/New_York:20260929T090000',
  'DTEND;TZID=America/New_York:20260929T093000',
  'UID:ny@google.com',
  'SUMMARY:뉴욕 팀 싱크',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;TZID=Asia/Seoul:20260929T100000',
  'DTEND;TZID=Asia/Seoul:20260929T110000',
  'STATUS:CANCELLED',
  'UID:cancelled@google.com',
  'SUMMARY:취소된 일정',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART:20250101T000000Z',
  'DTEND:20250101T010000Z',
  'UID:old@google.com',
  'SUMMARY:지난 일정',
  'END:VEVENT',
  'END:VCALENDAR'
].join('\r\n')

const events = parseIcs(FEED, new Date('2026-09-25T00:00:00Z'), new Date('2026-11-01T00:00:00Z'))
const rows = events.map((e) => [e.title, e.start, e.all_day])

assert.deepEqual(rows, [
  ['주간 회의', '2026-09-28T01:00:00.000Z', false],
  ['고객 통화', '2026-09-29T06:00:00.000Z', false],
  ['뉴욕 팀 싱크', '2026-09-29T13:00:00.000Z', false], // no VTIMEZONE: resolved via the IANA name (EDT)
  ['워크숍', new Date('2026-09-30T00:00:00').toISOString(), true], // all-day = local midnight
  ['주간 회의 (시간 변경)', '2026-10-12T05:00:00.000Z', false], // RECURRENCE-ID override; 10/5 excluded
  ['주간 회의', '2026-10-19T01:00:00.000Z', false] // COUNT=4 ends the series
])
assert.equal(events[0].location, '본사 3층')
assert.equal(events[0].end, '2026-09-28T02:00:00.000Z')
assert.equal(events[1].description, '첫 줄\n둘째 줄은 길어서 접혀 있음', 'escapes + folded lines')
assert.equal(events[3].end, new Date('2026-10-02T00:00:00').toISOString(), 'all-day end is exclusive')
assert.equal(new Set(events.map((e) => e.id)).size, events.length, 'occurrence ids are unique')

assert.throws(() => parseIcs('<html>login page</html>', new Date(), new Date()), /iCal/)
console.log('ics: all assertions passed')
