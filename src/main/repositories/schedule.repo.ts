// 일정 (calendar schedules): all-day items store local dates ('YYYY-MM-DD', end inclusive)
// so they never shift with the timezone; timed items store ISO datetimes. start_day /
// end_day (local dates) make range queries uniform for both.
import { getDb } from '../db'
import { newId, nowIso } from './util'
import { workspaceRepo } from './workspace.repo'
import type { CreateScheduleInput, Schedule, UpdateScheduleInput } from '@shared/types'

const DEFAULT_COLOR = '#6366f1'
const MAX_TITLE = 200
const MAX_TEXT = 10_000
const DAY = /^\d{4}-\d{2}-\d{2}$/
const COLOR = /^#[0-9a-f]{6}$/i

interface Row extends Omit<Schedule, 'all_day'> {
  all_day: number
}

const fromRow = (r: Row): Schedule => ({ ...r, all_day: r.all_day === 1 })

const localDay = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function validDay(s: string): boolean {
  if (!DAY.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
}

/** Validate and derive the stored fields; throws a user-facing message. */
function normalize(s: Omit<Schedule, 'id' | 'start_day' | 'end_day' | 'created_at' | 'updated_at' | 'deleted_at'>): Omit<Schedule, 'id' | 'created_at' | 'updated_at' | 'deleted_at'> {
  const title = (s.title ?? '').trim().slice(0, MAX_TITLE)
  if (!title) throw new Error('일정 제목을 입력하세요.')
  if (s.workspace_id !== null && !workspaceRepo.getById(s.workspace_id)) throw new Error('데스크를 찾을 수 없습니다.')
  if (!COLOR.test(s.color)) throw new Error('색 형식이 올바르지 않습니다.')
  let startDay: string
  let endDay: string
  if (s.all_day) {
    if (!validDay(s.start) || !validDay(s.end)) throw new Error('날짜 형식이 올바르지 않습니다 (예: 2026-10-01).')
    if (s.end < s.start) throw new Error('종료일이 시작일보다 빠릅니다.')
    ;[startDay, endDay] = [s.start, s.end]
  } else {
    const a = new Date(s.start)
    const b = new Date(s.end)
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) throw new Error('날짜·시간 형식이 올바르지 않습니다.')
    if (b <= a) throw new Error('종료 시간이 시작 시간보다 늦어야 합니다.')
    ;[startDay, endDay] = [localDay(a), localDay(new Date(b.getTime() - 1))]
  }
  return {
    workspace_id: s.workspace_id,
    title,
    note: (s.note ?? '').slice(0, MAX_TEXT),
    location: (s.location ?? '').trim().slice(0, MAX_TITLE),
    color: s.color,
    all_day: s.all_day,
    start: s.start,
    end: s.end,
    start_day: startDay,
    end_day: endDay
  }
}

const COLUMNS = 'id, workspace_id, title, note, location, color, all_day, start, "end", start_day, end_day, created_at, updated_at, deleted_at'

export const scheduleRepo = {
  /** Live schedules touching [fromDay, toDay] (inclusive); workspaceId null = every desk. */
  listBetween(fromDay: string, toDay: string, workspaceId: string | null): Schedule[] {
    const rows = getDb()
      .prepare(
        `SELECT ${COLUMNS} FROM schedules
         WHERE deleted_at IS NULL AND start_day <= @to AND end_day >= @from
           AND (@desk IS NULL OR workspace_id = @desk)
         ORDER BY start_day ASC, all_day DESC, start ASC`
      )
      .all({ from: fromDay, to: toDay, desk: workspaceId }) as Row[]
    return rows.map(fromRow)
  },

  getById(id: string): Schedule | undefined {
    const row = getDb().prepare(`SELECT ${COLUMNS} FROM schedules WHERE id = ? AND deleted_at IS NULL`).get(id) as Row | undefined
    return row ? fromRow(row) : undefined
  },

  create(input: CreateScheduleInput): Schedule {
    const now = nowIso()
    const row: Schedule = {
      id: newId(),
      ...normalize({
        workspace_id: input.workspace_id ?? null,
        title: input.title,
        note: input.note ?? '',
        location: input.location ?? '',
        color: input.color ?? DEFAULT_COLOR,
        all_day: input.all_day,
        start: input.start,
        end: input.end
      }),
      created_at: now,
      updated_at: now,
      deleted_at: null
    }
    getDb()
      .prepare(
        `INSERT INTO schedules (${COLUMNS})
         VALUES (@id, @workspace_id, @title, @note, @location, @color, @all_day, @start, @end, @start_day, @end_day, @created_at, @updated_at, @deleted_at)`
      )
      .run({ ...row, all_day: row.all_day ? 1 : 0 })
    return row
  },

  update(input: UpdateScheduleInput): Schedule {
    const existing = this.getById(input.id)
    if (!existing) throw new Error('일정을 찾을 수 없습니다.')
    const merged = normalize({
      workspace_id: input.workspace_id === undefined ? existing.workspace_id : input.workspace_id,
      title: input.title ?? existing.title,
      note: input.note ?? existing.note,
      location: input.location ?? existing.location,
      color: input.color ?? existing.color,
      all_day: input.all_day ?? existing.all_day,
      start: input.start ?? existing.start,
      end: input.end ?? existing.end
    })
    const row: Schedule = { ...existing, ...merged, updated_at: nowIso() }
    getDb()
      .prepare(
        `UPDATE schedules SET workspace_id = @workspace_id, title = @title, note = @note, location = @location, color = @color,
           all_day = @all_day, start = @start, "end" = @end, start_day = @start_day, end_day = @end_day, updated_at = @updated_at
         WHERE id = @id`
      )
      .run({ ...row, all_day: row.all_day ? 1 : 0 })
    return row
  },

  remove(id: string): void {
    const now = nowIso()
    getDb().prepare('UPDATE schedules SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now, now, id)
  },

  /** Undo a delete (the toast's 되돌리기). */
  restore(id: string): void {
    getDb().prepare('UPDATE schedules SET deleted_at = NULL, updated_at = ? WHERE id = ?').run(nowIso(), id)
  }
}
