import { useEffect } from 'react'
import { useStore } from './store/useStore'
import { Sidebar } from './components/Sidebar'
import { MainArea } from './components/MainArea'
import { QuickCapture } from './components/QuickCapture'

function App(): JSX.Element {
  const init = useStore((s) => s.init)
  const loading = useStore((s) => s.loading)
  const error = useStore((s) => s.error)
  const openQuickCapture = useStore((s) => s.openQuickCapture)

  useEffect(() => {
    init()
  }, [init])

  // Global shortcut: Cmd/Ctrl+N opens quick capture from anywhere.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        openQuickCapture()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openQuickCapture])

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
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
    </div>
  )
}

export default App
