import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@/store/useStore'
import { eventDayKeys } from '@/lib/format'
import type { CalendarEvent } from '@shared/types'

/**
 * Subscribed-calendar events overlapping [from, to), plus a day → events index.
 * Reloads when the calendars are re-synced in the background.
 */
export function useCalendarEvents(from: Date, to: Date): { events: CalendarEvent[]; byDay: Map<string, CalendarEvent[]> } {
  const version = useStore((s) => s.calendarVersion)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const fromIso = from.toISOString()
  const toIso = to.toISOString()

  useEffect(() => {
    let current = true
    window.api.calendar.events(fromIso, toIso).then(
      (e) => current && setEvents(e),
      (error) => console.error('Failed to load calendar events:', error)
    )
    return () => {
      current = false
    }
  }, [fromIso, toIso, version])

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const e of events) {
      for (const key of eventDayKeys(e)) map.set(key, [...(map.get(key) ?? []), e])
    }
    return map
  }, [events])

  return { events, byDay }
}
