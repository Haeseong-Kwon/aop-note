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
import { DocumentViewer } from './components/DocumentViewer'
import { popUndo } from './store/undo'
import { useToast, toastError } from './store/useToast'
import { FloatingTools } from './components/tools/FloatingTools'
import { useAppEvents } from './hooks/useAppEvents'

function App(): JSX.Element {
  const loading = useStore((s) => s.loading)
  const error = useStore((s) => s.error)
  const openQuickCapture = useStore((s) => s.openQuickCapture)
  const openPalette = useStore((s) => s.openPalette)
  const toggleHelp = useStore((s) => s.toggleHelp)
  const collapse = useStore((s) => s.collapse)
  const sidebarCollapsed = useStore((s) => s.sidebarCollapsed)
  const openDocument = useStore((s) => s.openDocument)
  const closeDocument = useStore((s) => s.closeDocument)
  const toggleSidebar = useStore((s) => s.toggleSidebar)

  useAppEvents()

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
      // App-level undo (moves, status, renames…) when focus isn't in a text field — those keep their own undo.
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'z' && !isTypingTarget(e.target)) {
        e.preventDefault()
        void popUndo()
          .then((label) => useToast.getState().show({ message: label ? `실행 취소: ${label}` : '되돌릴 작업이 없습니다.' }))
          .catch(toastError)
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
      <FloatingTools />
      <Toast />
      <FilePreview />
      {openDocument && (
        <DocumentViewer attachmentId={openDocument.id} fileName={openDocument.fileName} onClose={closeDocument} />
      )}
    </div>
  )
}

export default App
