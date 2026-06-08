import type Database from 'better-sqlite3'

// Each migration bumps user_version by 1. Migrations run in order, idempotently,
// on every app start. Add new migrations to the END of this array — never reorder.
type Migration = (db: Database.Database) => void

const migrations: Migration[] = [
  // 0001 — initial schema
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        color       TEXT NOT NULL DEFAULT '#6366f1',
        sort_order  INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL,
        deleted_at  TEXT
      );

      CREATE TABLE IF NOT EXISTS categories (
        id            TEXT PRIMARY KEY,
        workspace_id  TEXT NOT NULL REFERENCES workspaces(id),
        name          TEXT NOT NULL,
        color         TEXT NOT NULL DEFAULT '#94a3b8',
        parent_id     TEXT REFERENCES categories(id),
        sort_order    INTEGER NOT NULL DEFAULT 0,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL,
        deleted_at    TEXT
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id            TEXT PRIMARY KEY,
        category_id   TEXT NOT NULL REFERENCES categories(id),
        title         TEXT NOT NULL,
        note          TEXT NOT NULL DEFAULT '',
        status        TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','doing','done')),
        priority      INTEGER NOT NULL DEFAULT 0 CHECK(priority BETWEEN 0 AND 3),
        due_date      TEXT,
        sort_order    INTEGER NOT NULL DEFAULT 0,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL,
        completed_at  TEXT,
        deleted_at    TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_categories_workspace ON categories(workspace_id);
      CREATE INDEX IF NOT EXISTS idx_categories_parent    ON categories(parent_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_category        ON tasks(category_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_status          ON tasks(status);
    `)
  },

  // 0002 — goals (per-desk objectives) + task→goal link
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS goals (
        id            TEXT PRIMARY KEY,
        workspace_id  TEXT NOT NULL REFERENCES workspaces(id),
        title         TEXT NOT NULL,
        description   TEXT NOT NULL DEFAULT '',
        due_date      TEXT,
        status        TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','doing','done')),
        sort_order    INTEGER NOT NULL DEFAULT 0,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL,
        completed_at  TEXT,
        deleted_at    TEXT
      );

      ALTER TABLE tasks ADD COLUMN goal_id TEXT REFERENCES goals(id);

      CREATE INDEX IF NOT EXISTS idx_goals_workspace ON goals(workspace_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_goal       ON tasks(goal_id);
    `)
  }
]

export function runMigrations(db: Database.Database): void {
  const current = db.pragma('user_version', { simple: true }) as number
  for (let version = current; version < migrations.length; version++) {
    const migrate = migrations[version]
    const tx = db.transaction(() => {
      migrate(db)
      db.pragma(`user_version = ${version + 1}`)
    })
    tx()
  }
}
