import { getDb } from '../db'
import { newId, nowIso } from './util'
import type { Property, PropertyType, PropertyValue, PropertyValues, SelectOption } from '@shared/types'

const TYPES: readonly PropertyType[] = ['text', 'number', 'select', 'multi_select', 'date', 'checkbox', 'url']
const OPTION_COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red']
const MAX_NAME = 100
const MAX_TEXT = 10_000

interface Row extends Omit<Property, 'options'> {
  options: string
}

const toProperty = (r: Row): Property => ({ ...r, options: JSON.parse(r.options) as SelectOption[] })

function getRow(id: string): Row {
  const row = getDb().prepare('SELECT * FROM properties WHERE id = ? AND deleted_at IS NULL').get(id) as Row | undefined
  if (!row) throw new Error('속성을 찾을 수 없습니다.')
  return row
}

function cleanName(name: string): string {
  const n = name.trim().slice(0, MAX_NAME)
  if (!n) throw new Error('속성 이름을 입력하세요.')
  return n
}

/** Validate / normalise a value for its property type; null clears. */
function normalise(type: PropertyType, value: unknown): PropertyValue | null {
  if (value === null || value === undefined || value === '') return null
  switch (type) {
    case 'text':
      return String(value).slice(0, MAX_TEXT)
    case 'number': {
      const n = typeof value === 'number' ? value : Number(value)
      if (!Number.isFinite(n)) throw new Error('숫자 속성에는 숫자만 넣을 수 있습니다.')
      return n
    }
    case 'checkbox':
      if (typeof value !== 'boolean') throw new Error('체크박스 속성에는 true / false만 넣을 수 있습니다.')
      return value
    case 'date':
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('날짜는 YYYY-MM-DD 형식이어야 합니다.')
      return value
    case 'url': {
      const s = String(value).trim()
      let u: URL
      try {
        u = new URL(s)
      } catch {
        throw new Error('URL 형식이 아닙니다.')
      }
      if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('http(s) 주소만 넣을 수 있습니다.')
      return u.toString()
    }
    case 'select':
      return String(value).trim().slice(0, MAX_NAME) || null
    case 'multi_select': {
      if (!Array.isArray(value)) throw new Error('다중 선택 값은 목록이어야 합니다.')
      const names = [...new Set(value.map((v) => String(v).trim().slice(0, MAX_NAME)).filter(Boolean))]
      return names.length ? names : null
    }
  }
}

export const propertyRepo = {
  listByWorkspace(workspaceId: string): Property[] {
    return (
      getDb()
        .prepare('SELECT * FROM properties WHERE workspace_id = ? AND deleted_at IS NULL ORDER BY sort_order, created_at')
        .all(workspaceId) as Row[]
    ).map(toProperty)
  },

  create(input: { workspace_id: string; name: string; type: PropertyType }): Property {
    if (!TYPES.includes(input.type)) throw new Error('지원하지 않는 속성 종류입니다.')
    const db = getDb()
    const next = (
      db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM properties WHERE workspace_id = ?').get(input.workspace_id) as { n: number }
    ).n
    const row: Row = {
      id: newId(),
      workspace_id: input.workspace_id,
      name: cleanName(input.name),
      type: input.type,
      options: '[]',
      sort_order: next
    }
    db.prepare(
      'INSERT INTO properties (id, workspace_id, name, type, options, sort_order, created_at) VALUES (@id, @workspace_id, @name, @type, @options, @sort_order, @created_at)'
    ).run({ ...row, created_at: nowIso() })
    return toProperty(row)
  },

  update(input: { id: string; name?: string; options?: SelectOption[]; sort_order?: number }): Property {
    const row = getRow(input.id)
    const next: Row = {
      ...row,
      name: input.name === undefined ? row.name : cleanName(input.name),
      options:
        input.options === undefined
          ? row.options
          : JSON.stringify(
              input.options
                .filter((o) => o && typeof o.name === 'string' && o.name.trim())
                .map((o) => ({ name: o.name.trim().slice(0, MAX_NAME), color: OPTION_COLORS.includes(o.color) ? o.color : 'gray' }))
            ),
      sort_order: input.sort_order ?? row.sort_order
    }
    getDb().prepare('UPDATE properties SET name = @name, options = @options, sort_order = @sort_order WHERE id = @id').run(next)
    return toProperty(next)
  },

  remove(id: string): void {
    const db = getDb()
    db.transaction(() => {
      db.prepare('UPDATE properties SET deleted_at = ? WHERE id = ?').run(nowIso(), id)
      db.prepare('DELETE FROM task_values WHERE property_id = ?').run(id)
    })()
  },

  /** Set (or with null, clear) one cell. New select choices are added to the options. */
  setValue(taskId: string, propertyId: string, value: unknown): void {
    const row = getRow(propertyId)
    const v = normalise(row.type, value)
    const db = getDb()
    db.transaction(() => {
      if (v === null) {
        db.prepare('DELETE FROM task_values WHERE task_id = ? AND property_id = ?').run(taskId, propertyId)
        return
      }
      if (row.type === 'select' || row.type === 'multi_select') {
        const options = JSON.parse(row.options) as SelectOption[]
        const used = Array.isArray(v) ? v : [String(v)]
        const added = used.filter((name) => !options.some((o) => o.name === name))
        if (added.length) {
          const all = [...options, ...added.map((name, i) => ({ name, color: OPTION_COLORS[(options.length + i) % OPTION_COLORS.length] }))]
          db.prepare('UPDATE properties SET options = ? WHERE id = ?').run(JSON.stringify(all), propertyId)
        }
      }
      db.prepare(
        'INSERT INTO task_values (task_id, property_id, value) VALUES (?, ?, ?) ON CONFLICT(task_id, property_id) DO UPDATE SET value = excluded.value'
      ).run(taskId, propertyId, JSON.stringify(v))
    })()
  },

  valuesForWorkspace(workspaceId: string): PropertyValues {
    const rows = getDb()
      .prepare(
        `SELECT v.task_id, v.property_id, v.value FROM task_values v
         JOIN properties p ON p.id = v.property_id
         WHERE p.workspace_id = ? AND p.deleted_at IS NULL`
      )
      .all(workspaceId) as { task_id: string; property_id: string; value: string }[]
    const out: PropertyValues = {}
    for (const r of rows) (out[r.task_id] ??= {})[r.property_id] = JSON.parse(r.value) as PropertyValue
    return out
  }
}
