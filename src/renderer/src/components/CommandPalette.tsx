import { useEffect, useRef, useState } from 'react'
import { Search, CheckSquare, Folder, LayoutGrid } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { SearchHit } from '@shared/types'

const ICONS = {
  task: CheckSquare,
  category: Folder,
  workspace: LayoutGrid
} as const

export function CommandPalette(): JSX.Element {
  const open = useStore((s) => s.paletteOpen)
  const close = useStore((s) => s.closePalette)
  const navigateToTask = useStore((s) => s.navigateToTask)
  const selectWorkspace = useStore((s) => s.selectWorkspace)
  const selectCategory = useStore((s) => s.selectCategory)
  const setMainView = useStore((s) => s.setMainView)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchHit[]>([])
  const [index, setIndex] = useState(0)
  const reqId = useRef(0)

  useEffect(() => {
    if (open) {
      setQuery('')
      setResults([])
      setIndex(0)
    }
  }, [open])

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults([])
      return
    }
    const id = ++reqId.current
    window.api.search.query(q).then((hits) => {
      if (id === reqId.current) {
        setResults(hits)
        setIndex(0)
      }
    })
  }, [query])

  const activate = async (hit: SearchHit): Promise<void> => {
    if (hit.type === 'task' && hit.category_id) {
      await navigateToTask({
        workspace_id: hit.workspace_id,
        category_id: hit.category_id,
        task_id: hit.id
      })
    } else if (hit.type === 'category' && hit.category_id) {
      await selectWorkspace(hit.workspace_id)
      setMainView('tasks')
      selectCategory(hit.category_id)
    } else {
      await selectWorkspace(hit.workspace_id)
    }
    close()
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.nativeEvent.isComposing) return // 한글 IME 조합 Enter가 검색 결과를 즉시 열지 않도록
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIndex((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const hit = results[index]
      if (hit) activate(hit)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : close())}>
      <DialogContent className="top-[18%] max-w-xl gap-0 p-0" hideClose>
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            placeholder="작업 · 카테고리 · 데스크 검색…"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="max-h-80 overflow-y-auto p-1.5">
          {query.trim() && results.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">결과가 없습니다.</p>
          )}
          {!query.trim() && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              검색어를 입력하세요. <span className="text-foreground">↑↓</span> 이동 ·{' '}
              <span className="text-foreground">Enter</span> 열기
            </p>
          )}
          {results.map((hit, i) => {
            const Icon = ICONS[hit.type]
            return (
              <button
                key={`${hit.type}-${hit.id}`}
                onClick={() => activate(hit)}
                onMouseEnter={() => setIndex(i)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors',
                  i === index ? 'bg-accent' : 'hover:bg-accent/50'
                )}
              >
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: hit.color }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{hit.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{hit.subtitle}</span>
                </span>
              </button>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
