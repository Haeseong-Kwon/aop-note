import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store/useStore'
import { serializeNoteDoc } from '@shared/noteDoc'
import type { Task } from '@shared/types'

/** Resolved dark-mode flag from the app theme (re-renders on theme change). */
export function useIsDark(): boolean {
  const theme = useStore((s) => s.theme)
  return (
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  )
}

export interface MemoPersist {
  dark: boolean
  /** Markdown to hydrate the editor from (read once at mount). */
  initialMarkdown: string
  /** Lossless blocks saved alongside that Markdown. */
  initialDoc: string | null
  /** Call on every edit; debounced write to the DB. */
  onMarkdownChange: (markdown: string, blocks: unknown[]) => void
  /** Force an immediate write (export, fullscreen toggle, unmount). */
  persistNow: () => Promise<void>
  /**
   * Changes when the memo was rewritten outside this editor (e.g. Claude Code via MCP).
   * Use it as the editor's `key` so it reloads instead of saving over that change.
   */
  revision: number
}

/**
 * Persistence for a single task's memo: the Markdown copy plus the lossless block
 * tree (colours, toggles, callouts… don't survive Markdown). A formatting-only edit
 * leaves the Markdown unchanged, so both are compared. The consumer MUST mount with
 * `key={task.id}` so the internal refs re-hydrate when switching tasks.
 */
export function useMemoPersist(task: Task): MemoPersist {
  const updateTask = useStore((s) => s.updateTask)
  const dark = useIsDark()
  const markdownRef = useRef(task.note)
  const docRef = useRef(task.note_doc)
  const lastSaved = useRef(task.note)
  const lastSavedDoc = useRef(task.note_doc)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [revision, setRevision] = useState(0)

  // The store refreshes on window focus. A note that differs from what this editor
  // last loaded/saved was changed elsewhere: adopt it and remount the editor.
  useEffect(() => {
    if (task.note === lastSaved.current && task.note_doc === lastSavedDoc.current) return
    if (task.note === markdownRef.current) return // our own pending edit echoed back
    if (timer.current) clearTimeout(timer.current)
    timer.current = undefined
    markdownRef.current = lastSaved.current = task.note
    docRef.current = lastSavedDoc.current = task.note_doc
    setRevision((r) => r + 1)
  }, [task.note, task.note_doc])

  const persistNow = async (): Promise<void> => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = undefined
    }
    const md = markdownRef.current
    const doc = docRef.current
    if (md !== lastSaved.current || doc !== lastSavedDoc.current) {
      lastSaved.current = md
      lastSavedDoc.current = doc
      await updateTask({ id: task.id, note: md, note_doc: doc })
    }
  }

  const onMarkdownChange = (markdown: string, blocks: unknown[]): void => {
    markdownRef.current = markdown
    docRef.current = serializeNoteDoc(markdown, blocks)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void persistNow(), 1000)
  }

  // Flush pending edits when the memo unmounts (row collapsed, task switch).
  useEffect(() => {
    return () => void persistNow()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id])

  return { dark, initialMarkdown: markdownRef.current, initialDoc: docRef.current, onMarkdownChange, persistNow, revision }
}
