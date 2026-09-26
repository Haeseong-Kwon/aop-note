import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import { randomUUID } from 'crypto'
import { app, safeStorage } from 'electron'
import { getDb } from './db'
import { parseIcs } from './ics'
import type { CalendarEvent, CalendarInfo } from '@shared/types'

/**
 * Read-only subscriptions to iCal feeds (Google Calendar's "secret address in iCal
 * format", iCloud, Outlook…). The address is a credential — anyone with it can read the
 * calendar — so it is encrypted with the OS keychain (safeStorage), never returned to
 * the renderer, and never put in errors or logs. Occurrences are cached in SQLite so
 * the calendar shows offline and to the MCP server.
 */

interface Stored extends CalendarInfo {
  url_enc: string
}

type Fetcher = (url: string) => Promise<string>
interface SyncOptions {
  fetcher?: Fetcher
  now?: Date
}

const PAST_DAYS = 60
const FUTURE_DAYS = 365
const MAX_FEED_BYTES = 10 * 1024 * 1024
const FETCH_TIMEOUT_MS = 20_000
const DAY_MS = 86_400_000

export const calendarsPath = (): string => join(app.getPath('userData'), 'calendars.json')

function load(): Stored[] {
  try {
    const data = JSON.parse(readFileSync(calendarsPath(), 'utf8')) as { calendars?: Stored[] }
    return Array.isArray(data.calendars) ? data.calendars : []
  } catch {
    return [] // no subscriptions yet
  }
}

const save = (calendars: Stored[]): void => writeFileSync(calendarsPath(), JSON.stringify({ calendars }, null, 2))

const publicInfo = ({ url_enc: _secret, ...info }: Stored): CalendarInfo => info

function encrypt(url: string): string {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('OS 보안 저장소를 사용할 수 없어 캘린더 주소를 안전하게 저장할 수 없습니다.')
  return safeStorage.encryptString(url).toString('base64')
}
const decrypt = (enc: string): string => safeStorage.decryptString(Buffer.from(enc, 'base64'))

/** https only (webcal:// is https with another name); anything else is refused. */
export function normalizeFeedUrl(input: string): string {
  const raw = input.trim().replace(/^webcal:\/\//i, 'https://')
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('캘린더 주소가 올바르지 않습니다. "iCal 형식의 비공개 주소"를 붙여 넣으세요.')
  }
  if (url.protocol !== 'https:') throw new Error('보안을 위해 https 주소만 사용할 수 있습니다.')
  return url.toString()
}

async function fetchFeed(url: string): Promise<string> {
  let res: Response
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  } catch {
    throw new Error('캘린더 서버에 연결하지 못했습니다. 네트워크를 확인하세요.')
  }
  if (!res.ok) throw new Error(`캘린더를 받지 못했습니다 (HTTP ${res.status}). 주소가 바뀌었는지 확인하세요.`)
  if (Number(res.headers.get('content-length') ?? 0) > MAX_FEED_BYTES) throw new Error('캘린더 파일이 너무 큽니다.')
  const text = await res.text()
  if (text.length > MAX_FEED_BYTES) throw new Error('캘린더 파일이 너무 큽니다.')
  return text
}

/** Fetch + parse, then replace the calendar's cached events in one transaction. */
async function refresh(cal: Stored, url: string, { fetcher = fetchFeed, now = new Date() }: SyncOptions): Promise<number> {
  const feed = await fetcher(url)
  const events = parseIcs(feed, new Date(now.getTime() - PAST_DAYS * DAY_MS), new Date(now.getTime() + FUTURE_DAYS * DAY_MS))
  const db = getDb()
  const insert = db.prepare(
    `INSERT OR REPLACE INTO calendar_events (id, calendar_id, title, location, description, start, end, all_day)
     VALUES (@id, @calendar_id, @title, @location, @description, @start, @end, @all_day)`
  )
  db.transaction(() => {
    db.prepare('DELETE FROM calendar_events WHERE calendar_id = ?').run(cal.id)
    for (const e of events) {
      insert.run({ ...e, id: `${cal.id}|${e.id}`, calendar_id: cal.id, all_day: e.all_day ? 1 : 0 })
    }
  })()
  return events.length
}

export function listCalendars(): CalendarInfo[] {
  return load().map(publicInfo)
}

/** Validates by fetching once; an unreadable feed is refused and nothing is stored. */
export async function addCalendar(
  input: { name: string; url: string; color: string },
  options: SyncOptions = {}
): Promise<CalendarInfo> {
  const url = normalizeFeedUrl(input.url)
  const name = input.name.trim().slice(0, 100) || '캘린더'
  const color = /^#[0-9a-f]{6}$/i.test(input.color) ? input.color : '#3b6ea5'
  const cal: Stored = { id: randomUUID(), name, color, url_enc: encrypt(url), last_sync: null, last_error: null, event_count: 0 }
  const count = await refresh(cal, url, options)
  const stored = { ...cal, event_count: count, last_sync: (options.now ?? new Date()).toISOString() }
  save([...load(), stored])
  return publicInfo(stored)
}

export async function syncCalendar(id: string, options: SyncOptions = {}): Promise<CalendarInfo> {
  const cal = load().find((c) => c.id === id)
  if (!cal) throw new Error('구독 중인 캘린더가 아닙니다.')
  let next: Stored
  try {
    const count = await refresh(cal, decrypt(cal.url_enc), options)
    next = { ...cal, event_count: count, last_sync: (options.now ?? new Date()).toISOString(), last_error: null }
  } catch (error) {
    // Keep the last good events; say why this sync failed.
    next = { ...cal, last_error: error instanceof Error ? error.message : String(error) }
  }
  save(load().map((c) => (c.id === id ? next : c)))
  return publicInfo(next)
}

export async function syncAllCalendars(): Promise<void> {
  for (const cal of load()) await syncCalendar(cal.id)
}

export function removeCalendar(id: string): void {
  getDb().prepare('DELETE FROM calendar_events WHERE calendar_id = ?').run(id)
  save(load().filter((c) => c.id !== id))
}

/** Cached occurrences overlapping [fromIso, toIso), with their calendar's name and color. */
export function eventsBetween(fromIso: string, toIso: string): CalendarEvent[] {
  const calendars = new Map(load().map((c) => [c.id, c]))
  const rows = getDb()
    .prepare('SELECT * FROM calendar_events WHERE start < ? AND end > ? ORDER BY start, title')
    // Normalise so string comparison matches stored toISOString() values exactly.
    .all(new Date(toIso).toISOString(), new Date(fromIso).toISOString()) as (Omit<CalendarEvent, 'all_day' | 'calendar_name' | 'color'> & { all_day: number })[]
  return rows.flatMap((r) => {
    const cal = calendars.get(r.calendar_id)
    return cal ? [{ ...r, all_day: r.all_day === 1, calendar_name: cal.name, color: cal.color }] : []
  })
}
