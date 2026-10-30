import { useEffect } from 'react'
import { useStore } from '@/store/useStore'
import { toastError } from '@/store/useToast'

/** Loading the data and keeping it current from main-process events; shared by the desktop and phone shells. */
export function useAppEvents(): void {
  const init = useStore((s) => s.init)
  const navigateToTask = useStore((s) => s.navigateToTask)
  const openQuickCapture = useStore((s) => s.openQuickCapture)

  useEffect(() => {
    init()
  }, [init])

  // Navigation requests from notification clicks (main → renderer).
  useEffect(() => {
    return window.api.onNavigateToTask((payload) => {
      navigateToTask(payload)
    })
  }, [navigateToTask])

  // Claude Code (via MCP) can add notes while the app is in the background.
  useEffect(() => {
    const onFocus = (): void => void useStore.getState().refresh()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  // A linked project folder changed on disk (docs edited, commit made).
  useEffect(() => window.api.onProjectChanged(() => useStore.getState().bumpProjectVersion()), [])

  useEffect(() => window.api.onCalendarsSynced(() => useStore.getState().bumpCalendarVersion()), [])

  // Another device's edits were merged in (folder sync): reload desks and the open view.
  useEffect(
    () =>
      window.api.onDataMerged(() => {
        void window.api.workspace
          .list()
          .then((workspaces) => {
            useStore.setState({ workspaces })
            return useStore.getState().refresh()
          })
          .catch(toastError)
      }),
    []
  )

  // System-wide quick capture (global shortcut / menu-bar icon).
  useEffect(() => window.api.onQuickCapture(() => openQuickCapture()), [openQuickCapture])

  // Prevent the window from navigating away when a file is dropped outside a drop zone.
  useEffect(() => {
    const prevent = (e: DragEvent): void => e.preventDefault()
    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)
    return () => {
      window.removeEventListener('dragover', prevent)
      window.removeEventListener('drop', prevent)
    }
  }, [])
}
