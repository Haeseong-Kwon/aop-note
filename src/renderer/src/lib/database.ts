import { STATUS_META, PRIORITY_META } from './format'
import type { DatabaseData, Property, PropertyValue, TaskStatus, TaskWithContext } from '@shared/types'

// Notion-style database views over a desk's tasks. The block stores a ViewConfig;
// everything here is pure so views are cheap to recompute and easy to test.

export type ViewKind = 'table' | 'board' | 'list' | 'gallery'
export type FilterOp = 'is' | 'is_not' | 'contains' | 'empty' | 'not_empty' | 'before' | 'after'

/** Built-in fields, or "prop:<property id>". */
export type Field = 'title' | 'status' | 'priority' | 'due' | 'category' | 'updated' | `prop:${string}`

export interface ViewFilter {
  field: Field
  op: FilterOp
  value?: string
}

export interface ViewConfig {
  workspaceId: string
  /** Only this category's tasks; null = the whole desk. */
  categoryId: string | null
  title: string
  view: ViewKind
  filters: ViewFilter[]
  sort: { field: Field; dir: 'asc' | 'desc' } | null
  /** Board columns / grouped sections. */
  groupBy: Field | null
  /** Fields hidden from table columns / cards. */
  hidden: Field[]
}

export interface ViewGroup {
  key: string
  label: string
  color?: string
  rows: TaskWithContext[]
}

const VIEWS: readonly ViewKind[] = ['table', 'board', 'list', 'gallery']
const OPS: readonly FilterOp[] = ['is', 'is_not', 'contains', 'empty', 'not_empty', 'before', 'after']
const BUILT_IN: readonly string[] = ['title', 'status', 'priority', 'due', 'category', 'updated']
const STATUS_ORDER: TaskStatus[] = ['todo', 'doing', 'done']
const EMPTY_GROUP = '비어 있음'

export function defaultViewConfig(workspaceId: string, categoryId: string | null): ViewConfig {
  return { workspaceId, categoryId, title: '', view: 'table', filters: [], sort: null, groupBy: null, hidden: [] }
}

const isField = (v: unknown): v is Field => typeof v === 'string' && (BUILT_IN.includes(v) || /^prop:[\w-]+$/.test(v))

/** Parse a stored config, dropping anything malformed. */
export function parseViewConfig(json: string): ViewConfig | null {
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
  if (!raw || typeof raw.workspaceId !== 'string') return null
  const cfg = defaultViewConfig(raw.workspaceId, typeof raw.categoryId === 'string' ? raw.categoryId : null)
  if (typeof raw.title === 'string') cfg.title = raw.title.slice(0, 200)
  if (VIEWS.includes(raw.view as ViewKind)) cfg.view = raw.view as ViewKind
  if (Array.isArray(raw.filters)) {
    cfg.filters = raw.filters.filter(
      (f): f is ViewFilter =>
        !!f && isField(f.field) && OPS.includes(f.op) && (f.value === undefined || typeof f.value === 'string')
    )
  }
  const sort = raw.sort as { field?: unknown; dir?: unknown } | null
  if (sort && isField(sort.field) && (sort.dir === 'asc' || sort.dir === 'desc')) cfg.sort = { field: sort.field, dir: sort.dir }
  if (isField(raw.groupBy)) cfg.groupBy = raw.groupBy
  if (Array.isArray(raw.hidden)) cfg.hidden = raw.hidden.filter(isField)
  return cfg
}

const localDay = (iso: string): string => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** The raw value of a field for a row (undefined = empty). */
export function fieldValue(row: TaskWithContext, field: Field, data: DatabaseData): PropertyValue | undefined {
  switch (field) {
    case 'title':
      return row.title
    case 'status':
      return row.status
    case 'priority':
      return row.priority
    case 'due':
      return row.due_date ? localDay(row.due_date) : undefined
    case 'category':
      return row.category_name
    case 'updated':
      return row.updated_at
    default:
      return data.values[row.id]?.[field.slice(5)]
  }
}

const isEmpty = (v: PropertyValue | undefined): boolean =>
  v === undefined || v === '' || v === false || (Array.isArray(v) && v.length === 0)

function matches(row: TaskWithContext, f: ViewFilter, data: DatabaseData): boolean {
  const v = fieldValue(row, f.field, data)
  const want = f.value ?? ''
  switch (f.op) {
    case 'empty':
      return isEmpty(v)
    case 'not_empty':
      return !isEmpty(v)
    case 'is':
      return Array.isArray(v) ? v.includes(want) : String(v ?? '') === want
    case 'is_not':
      return Array.isArray(v) ? !v.includes(want) : String(v ?? '') !== want
    case 'contains':
      return Array.isArray(v) ? v.includes(want) : String(v ?? '').toLowerCase().includes(want.toLowerCase())
    case 'before':
      return v !== undefined && String(v) < want
    case 'after':
      return v !== undefined && String(v) > want
  }
}

function compare(a: PropertyValue | undefined, b: PropertyValue | undefined): number {
  if (isEmpty(a) && isEmpty(b)) return 0
  if (isEmpty(a)) return 1 // empties last, whatever the direction
  if (isEmpty(b)) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(Array.isArray(a) ? a.join(',') : a).localeCompare(String(Array.isArray(b) ? b.join(',') : b))
}

export function propertyOf(field: Field, data: DatabaseData): Property | undefined {
  return field.startsWith('prop:') ? data.properties.find((p) => p.id === field.slice(5)) : undefined
}

function groupsFor(rows: TaskWithContext[], field: Field, data: DatabaseData): ViewGroup[] {
  if (field === 'status') {
    return STATUS_ORDER.map((s) => ({ key: s, label: STATUS_META[s].label, rows: rows.filter((r) => r.status === s) }))
  }
  if (field === 'priority') {
    return ([3, 2, 1, 0] as const).map((p) => ({ key: String(p), label: PRIORITY_META[p].label, rows: rows.filter((r) => r.priority === p) }))
  }
  const prop = propertyOf(field, data)
  const keys = prop?.options.map((o) => o.name) ?? [...new Set(rows.map((r) => String(fieldValue(r, field, data) ?? '')).filter(Boolean))]
  const groups: ViewGroup[] = keys.map((k) => ({
    key: k,
    label: k,
    color: prop?.options.find((o) => o.name === k)?.color,
    rows: rows.filter((r) => {
      const v = fieldValue(r, field, data)
      return Array.isArray(v) ? v.includes(k) : String(v ?? '') === k
    })
  }))
  const empty = rows.filter((r) => isEmpty(fieldValue(r, field, data)))
  return [...groups.filter((g) => g.rows.length > 0 || prop), ...(empty.length ? [{ key: '', label: EMPTY_GROUP, rows: empty }] : [])]
}

/** Rows (and groups) for a view: scope → filters → sort → group. Input is not mutated. */
export function applyView(data: DatabaseData, cfg: ViewConfig): { rows: TaskWithContext[]; groups?: ViewGroup[] } {
  let rows = data.tasks.filter((r) => cfg.categoryId === null || r.category_id === cfg.categoryId)
  for (const f of cfg.filters) rows = rows.filter((r) => matches(r, f, data))
  if (cfg.sort) {
    const { field, dir } = cfg.sort
    const sign = dir === 'asc' ? 1 : -1
    rows = [...rows].sort((a, b) => {
      const va = fieldValue(a, field, data)
      const vb = fieldValue(b, field, data)
      if (isEmpty(va) !== isEmpty(vb)) return isEmpty(va) ? 1 : -1
      return sign * compare(va, vb)
    })
  }
  return cfg.groupBy ? { rows, groups: groupsFor(rows, cfg.groupBy, data) } : { rows }
}
