import { useEffect } from 'react'
import { useStore } from './store/useStore'
import { isTypingTarget } from './shortcuts'
import { Sidebar } from './components/Sidebar'
import { MainArea } from './components/MainArea'
import { QuickCapture } from './components/QuickCapture'
import { CommandPalette } from './components/CommandPalette'
import { HelpOverlay } from './components/HelpOverlay'
import { Toast } from './components/Toast'
import { FilePreview } from './components/FilePreview'

function App(): JSX.Element {
  const init = useStore((s) => s.init)
  const loading = useStore((s) => s.loading)
  const error = useStore((s) => s.error)
  const openQuickCapture = useStore((s) => s.openQuickCapture)
  const openPalette = useStore((s) => s.openPalette)
  const toggleHelp = useStore((s) => s.toggleHelp)
  const collapse = useStore((s) => s.collapse)
  const navigateToTask = useStore((s) => s.navigateToTask)
  const sidebarCollapsed = useStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useStore((s) => s.toggleSidebar)

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

  // Global shortcuts. Cmd/Ctrl combos work even while typing; bare keys (?, Esc)
  // yield to text inputs.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        openQuickCapture()
        return
      }
      if (mod && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        openPalette()
        return
      }
      if (mod && e.key === '\\') {
        e.preventDefault()
        toggleSidebar()
        return
      }
      if (e.key === '?' && !isTypingTarget(e.target)) {
        e.preventDefault()
        toggleHelp()
        return
      }
      if (e.key === 'Escape' && !isTypingTarget(e.target)) {
        collapse()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openQuickCapture, openPalette, toggleHelp, collapse, toggleSidebar])

  return (
    <div className="flex h-screen w-screen gap-2 overflow-hidden p-2 text-foreground">
      {!sidebarCollapsed && <Sidebar />}
      <MainArea />

      {loading && (
        <div className="pointer-events-none fixed bottom-4 right-4 rounded-md bg-card px-3 py-1.5 text-xs text-muted-foreground shadow">
          불러오는 중…
        </div>
      )}
      {error && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-md bg-destructive px-4 py-2 text-sm text-destructive-foreground shadow-lg">
          {error}
        </div>
      )}

      <QuickCapture />
      <CommandPalette />
      <HelpOverlay />
      <Toast />
      <FilePreview />
    </div>
  )
}

export default App
