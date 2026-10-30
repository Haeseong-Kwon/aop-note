// The main-process repository checks, run against the SQLite Wasm shim that the Android
// build uses instead of better-sqlite3 (npm run test:mobile). Same assertions, other engine.
import { initSqlite } from './shims/better-sqlite3'

await initSqlite()
await import('../main/repositories/trash.check')
await import('../main/repositories/hierarchy.check')
await import('../main/repositories/docs.check')
await import('../main/repositories/search.check')
await import('../main/sync.check')
await import('../main/repositories/graphStructure.check')
await import('../main/repositories/schedule.check')
await import('../main/repositories/recurrence.check')
await import('../main/repositories/reminder.check')
await import('../main/repositories/link.check')
await import('../main/repositories/noteDoc.check')
await import('../main/repositories/property.check')
await import('../main/repositories/synced.check')
