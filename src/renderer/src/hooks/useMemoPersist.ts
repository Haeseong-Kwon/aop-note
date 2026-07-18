import { useEffect, useRef } from 'react'
import { useStore } from '@/store/useStore'
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
  /** Call on every edit; debounced write to the DB. */
  onMarkdownChange: (markdown: string) => void
  /** Force an immediate write (export, fullscreen toggle, unmount). */
  persistNow: () => Promise<void>
}

/**
 * Markdown persistence for a single task's memo. The consumer MUST mount with
 * `key={task.id}` so the internal refs re-hydrate when switching tasks.
 */
export function useMemoPersist(task: Task): MemoPersist {
  const updateTask = useStore((s) => s.updateTask)
  const dark = useIsDark()
  const markdownRef = useRef(task.note)
  const lastSaved = useRef(task.note)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const persistNow = async (): Promise<void> => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = undefined
    }
    const md = markdownRef.current
    if (md !== lastSaved.current) {
      lastSaved.current = md
      await updateTask({ id: task.id, note: md })
    }
  }

  const onMarkdownChange = (markdown: string): void => {
    markdownRef.current = markdown
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void persistNow(), 1000)
  }

  // Flush pending edits when the memo unmounts (row collapsed, task switch).
  useEffect(() => {
    return () => void persistNow()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id])

  return { dark, initialMarkdown: markdownRef.current, onMarkdownChange, persistNow }
}
