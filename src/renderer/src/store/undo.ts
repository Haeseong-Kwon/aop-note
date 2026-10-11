// App-level undo for structural edits (status, priority, moves, reorders, renames, styles).
// Memo text has the editor's own undo, so it never lands here. Each entry restores the
// fields it changed; replaying an entry never records a new one.

export interface UndoEntry {
  label: string
  undo: () => Promise<void>
}

const MAX_ENTRIES = 50

let stack: readonly UndoEntry[] = []
let replaying = false

export function pushUndo(entry: UndoEntry): void {
  if (replaying) return
  stack = [...stack.slice(-(MAX_ENTRIES - 1)), entry]
}

/** Undo the latest entry; resolves its label, or null when there is nothing to undo. */
export async function popUndo(): Promise<string | null> {
  const entry = stack.at(-1)
  if (!entry) return null
  stack = stack.slice(0, -1)
  replaying = true
  try {
    await entry.undo()
  } finally {
    replaying = false
  }
  return entry.label
}

export const undoDepth = (): number => stack.length

/** The current values of `keys` on `obj` (to restore later). */
export function snapshot<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Pick<T, K> {
  return Object.fromEntries(keys.map((k) => [k, obj[k]])) as Pick<T, K>
}

/** Keys an update input actually changes (everything but `id` and the excluded ones). */
export function changedKeys<T extends { id: string }>(input: T, exclude: ReadonlySet<string> = new Set()): (keyof T)[] {
  return (Object.keys(input) as (keyof T & string)[]).filter((k) => k !== 'id' && !exclude.has(k) && input[k] !== undefined)
}
