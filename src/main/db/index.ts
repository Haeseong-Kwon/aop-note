import { join } from 'path'
import { app } from 'electron'
import Database from 'better-sqlite3'
import { runMigrations } from './migrations'

let db: Database.Database | null = null

/**
 * Opens (once) the SQLite database living under the OS user-data dir,
 * runs pending migrations, and seeds example data on first run.
 */
export function getDb(): Database.Database {
  if (db) return db

  const dbPath = join(app.getPath('userData'), 'aop-note.db')
  const instance = new Database(dbPath)

  // WAL = better concurrency + durability; foreign_keys for referential integrity.
  instance.pragma('journal_mode = WAL')
  instance.pragma('foreign_keys = ON')

  runMigrations(instance)

  db = instance
  return db
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}
