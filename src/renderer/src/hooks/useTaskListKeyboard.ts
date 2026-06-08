import { useEffect } from 'react'
import { useStore } from '@/store/useStore'
import { isTypingTarget } from '@/shortcuts'
import type { Task, Priority } from '@shared/types'

/**
 * Keyboard navigation for a visible, ordered task list.
 * Active only while no text field is focused. j/k move the selection,
 * Enter calls onActivate, Space/x toggles done, e edits the title,
 * 0–3 set priority. Mount in exactly one visible list at a time.
 */
export function useTaskListKeyboard(tasks: Task[], onActivate: (task: Task) => void): void {
  const selectedTaskId = useStore((s) => s.selectedTaskId)
  const setSelectedTask = useStore((s) => s.setSelectedTask)
  const setEditingTitle = useStore((s) => s.setEditingTitle)
  const toggleDone = useStore((s) => s.toggleDone)
  const setPriority = useStore((s) => s.setPriority)

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (isTypingTarget(e.target)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (tasks.length === 0) return

      const idx = tasks.findIndex((t) => t.id === selectedTaskId)
      const current = idx >= 0 ? tasks[idx] : null

      switch (e.key) {
        case 'j':
        case 'ArrowDown': {
          e.preventDefault()
          const next = idx < 0 ? 0 : Math.min(idx + 1, tasks.length - 1)
          setSelectedTask(tasks[next].id)
          break
        }
        case 'k':
        case 'ArrowUp': {
          e.preventDefault()
          const prev = idx < 0 ? 0 : Math.max(idx - 1, 0)
          setSelectedTask(tasks[prev].id)
          break
        }
        case 'Enter':
          if (current) {
            e.preventDefault()
            onActivate(current)
          }
          break
        case ' ':
        case 'x':
          if (current) {
            e.preventDefault()
            toggleDone(current)
          }
          break
        case 'e':
          if (current) {
            e.preventDefault()
            setSelectedTask(current.id)
            setEditingTitle(current.id)
          }
          break
        case '0':
        case '1':
        case '2':
        case '3':
          if (current) {
            e.preventDefault()
            setPriority(current.id, Number(e.key) as Priority)
          }
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [tasks, selectedTaskId, onActivate, setSelectedTask, setEditingTitle, toggleDone, setPriority])
}
