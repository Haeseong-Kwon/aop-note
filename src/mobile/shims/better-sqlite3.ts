import sqlite3InitModule from '@sqlite.org/sqlite-wasm'

// The subset of better-sqlite3 that src/main uses, on top of the official SQLite Wasm build
// (FTS5 + trigram included). Runs in-memory on the WebView's main thread, synchronously,
// so the repositories work unchanged. Persistence: `exportDb()` after `onWrite` fires.
//
// ponytail: whole-DB export per persist; fine for a few MB of notes. OPFS worker if it grows.

type Sqlite3 = Awaited<ReturnType<typeof sqlite3InitModule>>
type OoDb = InstanceType<Sqlite3['oo1']['DB']>
type Value = string | number | bigint | Uint8Array | null

let sqlite3: Sqlite3 | null = null
const preloaded = new Map<string, Uint8Array>()
const writeListeners = new Set<() => void>()

/** Must resolve before the first `new Database()`. */
export async function initSqlite(): Promise<void> {
  sqlite3 ??= await sqlite3InitModule()
}

/** Bytes of an existing DB file, used when `new Database(path)` opens that path. */
export function preloadDb(path: string, bytes: Uint8Array): void {
  preloaded.set(path, bytes)
}

/** Called after every statement that may have changed data. */
/** Called after every write outside a transaction (DB persistence, PC sync); returns a remover. */
export function onWrite(fn: () => void): () => void {
  writeListeners.add(fn)
  return () => writeListeners.delete(fn)
}

const lib = (): Sqlite3 => {
  if (!sqlite3) throw new Error('SQLite is not initialized (call initSqlite first)')
  return sqlite3
}

const toValue = (v: unknown): Value => {
  if (v === undefined || v === null) return null
  if (typeof v === 'boolean') return v ? 1 : 0
  if (v instanceof ArrayBuffer) return new Uint8Array(v)
  if (ArrayBuffer.isView(v)) return new Uint8Array(v.buffer, v.byteOffset, v.byteLength)
  return v as Value
}

type Stmt = ReturnType<OoDb['prepare']>

const isNamedObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v) && !ArrayBuffer.isView(v) && !(v instanceof ArrayBuffer)

/** better-sqlite3 call style → bindings: positional values, arrays, or one object of named values
 * (keys the SQL doesn't use are ignored, as better-sqlite3 does). */
function bind(stmt: Stmt, params: unknown[]): void {
  if (params.length === 0) return
  const only = params[0]
  if (params.length === 1 && isNamedObject(only)) {
    const capi = lib().capi
    const named: Record<string, Value> = {}
    const count = capi.sqlite3_bind_parameter_count(stmt.pointer!)
    for (let i = 1; i <= count; i++) {
      const name = capi.sqlite3_bind_parameter_name(stmt.pointer!, i)
      if (name) named[name] = toValue(only[name.slice(1)])
    }
    stmt.bind(named)
    return
  }
  stmt.bind(params.flat().map(toValue))
}

/** Statements that never change data (a PRAGMA without `=` only reads). */
const isRead = (sql: string): boolean => /^\s*select\b/i.test(sql) || (/^\s*pragma\b/i.test(sql) && !sql.includes('='))

class Statement {
  private plucked = false
  constructor(
    private readonly owner: Database,
    private readonly sql: string
  ) {}

  pluck(on = true): this {
    this.plucked = on
    return this
  }

  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint } {
    this.each(params, () => true)
    return {
      changes: this.owner.raw.changes(),
      lastInsertRowid: lib().capi.sqlite3_last_insert_rowid(this.owner.raw.pointer!)
    }
  }

  get(...params: unknown[]): unknown {
    return this.rows(params, 1)[0]
  }

  all(...params: unknown[]): unknown[] {
    return this.rows(params)
  }

  private rows(params: unknown[], limit = Infinity): unknown[] {
    const out: unknown[] = []
    this.each(params, (stmt) => {
      out.push(this.plucked ? fromSql(stmt.get(0)) : rowOf(stmt.get({}) as Record<string, unknown>))
      return out.length < limit
    })
    return out
  }

  /** Step through result rows while `onRow` returns true. */
  private each(params: unknown[], onRow: (stmt: Stmt) => boolean): void {
    const stmt = this.owner.raw.prepare(this.sql)
    try {
      bind(stmt, params)
      while (stmt.step() && onRow(stmt));
    } finally {
      stmt.finalize()
    }
    this.owner.touched(this.sql)
  }
}

const fromSql = (v: unknown): unknown =>
  v instanceof Uint8Array && typeof Buffer !== 'undefined' ? Buffer.from(v) : v

function rowOf(row: Record<string, unknown>): Record<string, unknown> {
  for (const k of Object.keys(row)) row[k] = fromSql(row[k])
  return row
}

export default class Database {
  readonly raw: OoDb
  private depth = 0

  constructor(path: string, _options?: unknown) {
    const s = lib()
    // The Wasm FS has no directories of ours: one flat file per distinct path.
    const file = `/${path.replace(/[\\/:]/g, '_')}`
    const bytes = preloaded.get(path)
    if (bytes) {
      s.capi.sqlite3_js_posix_create_file(file, bytes)
      preloaded.delete(path)
    }
    this.raw = new s.oo1.DB(file, 'c')
  }

  /** Writes notify the persister; reads (and anything inside an open transaction) don't. */
  touched(sql: string): void {
    if (this.depth === 0 && !isRead(sql)) writeListeners.forEach((fn) => fn())
  }

  prepare(sql: string): Statement {
    return new Statement(this, sql)
  }

  exec(sql: string): this {
    this.raw.exec(sql)
    this.touched(sql)
    return this
  }

  pragma(source: string, options?: { simple?: boolean }): unknown {
    const rows = this.prepare(`PRAGMA ${source}`).all() as Record<string, unknown>[]
    return options?.simple ? (rows[0] ? Object.values(rows[0])[0] : undefined) : rows
  }

  transaction<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
    return (...args: A): R => {
      const name = `sp${this.depth}`
      this.raw.exec(this.depth === 0 ? 'BEGIN' : `SAVEPOINT ${name}`)
      this.depth++
      try {
        const result = fn(...args)
        this.depth--
        this.raw.exec(this.depth === 0 ? 'COMMIT' : `RELEASE ${name}`)
        this.touched('COMMIT')
        return result
      } catch (error) {
        this.depth--
        this.raw.exec(this.depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${name}; RELEASE ${name}`)
        throw error
      }
    }
  }

  /** The whole database file, for persisting. */
  exportDb(): Uint8Array {
    return lib().capi.sqlite3_js_db_export(this.raw.pointer!)
  }

  backup(): Promise<never> {
    return Promise.reject(new Error('모바일에서는 지원하지 않습니다.'))
  }

  close(): void {
    this.raw.close()
  }
}

