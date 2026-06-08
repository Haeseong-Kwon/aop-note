import { useState } from 'react'
import { Plus, Check, X } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function Sidebar(): JSX.Element {
  const workspaces = useStore((s) => s.workspaces)
  const activeId = useStore((s) => s.activeWorkspaceId)
  const selectWorkspace = useStore((s) => s.selectWorkspace)
  const createWorkspace = useStore((s) => s.createWorkspace)

  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')

  const submit = async (): Promise<void> => {
    await createWorkspace(name)
    setName('')
    setAdding(false)
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-card/40">
      <div className="drag-region flex h-12 shrink-0 items-center gap-2 px-4">
        <div className="flex h-5 w-5 items-center justify-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground">
          A
        </div>
        <span className="text-sm font-semibold tracking-tight">AOP Note</span>
      </div>

      <div className="px-4 pb-2 pt-2">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">데스크</h2>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2">
        {workspaces.map((ws) => (
          <button
            key={ws.id}
            onClick={() => selectWorkspace(ws.id)}
            className={cn(
              'no-drag flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors',
              ws.id === activeId
                ? 'bg-accent font-medium text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            )}
          >
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: ws.color }} />
            <span className="truncate">{ws.name}</span>
          </button>
        ))}

        {workspaces.length === 0 && !adding && (
          <p className="px-3 py-2 text-xs text-muted-foreground">아직 데스크가 없습니다.</p>
        )}
      </nav>

      <div className="border-t border-border p-2">
        {adding ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
                if (e.key === 'Escape') {
                  setAdding(false)
                  setName('')
                }
              }}
              placeholder="데스크 이름"
              className="no-drag h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={submit}>
              <Check className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => {
                setAdding(false)
                setName('')
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground"
            onClick={() => setAdding(true)}
          >
            <Plus className="h-4 w-4" />새 데스크
          </Button>
        )}
      </div>
    </aside>
  )
}
