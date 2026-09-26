import { useEffect, useRef, useState } from 'react'
import {
  Search,
  CheckSquare,
  Folder,
  LayoutGrid,
  Sun,
  CalendarCheck,
  SquarePen,
  Keyboard,
  Trash2,
  Settings,
  Waypoints,
  FolderGit2,
  type LucideIcon,
  Sparkles
} from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { SearchHit } from '@shared/types'

const HIT_ICONS = {
  task: CheckSquare,
  category: Folder,
  workspace: LayoutGrid
} as const

/** One selectable row — a search hit or, with an empty query, a quick action / desk. */
interface Entry {
  key: string
  group: string
  icon: LucideIcon
  color?: string
  title: string
  subtitle?: string
  hint?: string
  run: () => void | Promise<void>
}

export function CommandPalette(): JSX.Element {
  const open = useStore((s) => s.paletteOpen)
  const close = useStore((s) => s.closePalette)
  const workspaces = useStore((s) => s.workspaces)
  const navigateToTask = useStore((s) => s.navigateToTask)
  const selectWorkspace = useStore((s) => s.selectWorkspace)
  const selectCategory = useStore((s) => s.selectCategory)
  const selectSmartView = useStore((s) => s.selectSmartView)
  const setMainView = useStore((s) => s.setMainView)
  const openQuickCapture = useStore((s) => s.openQuickCapture)
  const toggleHelp = useStore((s) => s.toggleHelp)
  const openUtility = useStore((s) => s.openUtility)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchHit[]>([])
  const [index, setIndex] = useState(0)
  const reqId = useRef(0)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setResults([])
      setIndex(0)
    }
  }, [open])

  useEffect(() => {
    const q = query.trim()
    setIndex(0)
    if (!q) {
      setResults([])
      return
    }
    const id = ++reqId.current
    window.api.search.query(q).then((hits) => {
      if (id === reqId.current) setResults(hits)
    })
  }, [query])

  const openHit = async (hit: SearchHit): Promise<void> => {
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
  }

  const entries: Entry[] = query.trim()
    ? results.map((hit) => ({
        key: `${hit.type}-${hit.id}`,
        group: '검색 결과',
        icon: HIT_ICONS[hit.type],
        color: hit.color,
        title: hit.title,
        subtitle: hit.subtitle,
        run: () => openHit(hit)
      }))
    : [
        { key: 'a-capture', group: '바로 가기', icon: SquarePen, title: '빠른 추가', hint: '⌘N', run: () => openQuickCapture() },
        { key: 'a-today', group: '바로 가기', icon: Sun, title: '오늘', run: () => selectSmartView('today') },
        { key: 'a-week', group: '바로 가기', icon: CalendarCheck, title: '이번 주', run: () => selectSmartView('week') },
        { key: 'a-help', group: '바로 가기', icon: Keyboard, title: '키보드 단축키', hint: '?', run: toggleHelp },
        { key: 'a-projects', group: '바로 가기', icon: FolderGit2, title: '프로젝트 목록', run: () => openUtility('projects') },
        { key: 'a-ask', group: '바로 가기', icon: Sparkles, title: 'AI에게 묻기 (내 메모 기반)', run: () => openUtility('ask') },
        { key: 'a-graph', group: '바로 가기', icon: Waypoints, title: '그래프', run: () => openUtility('graph') },
        { key: 'a-trash', group: '바로 가기', icon: Trash2, title: '휴지통', run: () => openUtility('trash') },
        { key: 'a-settings', group: '바로 가기', icon: Settings, title: '설정 · 백업', run: () => openUtility('settings') },
        ...workspaces.map((w) => ({
          key: `w-${w.id}`,
          group: '데스크',
          icon: LayoutGrid,
          color: w.color,
          title: w.name,
          run: () => selectWorkspace(w.id)
        }))
      ]

  // Close first so an action that opens another overlay (quick capture, help) isn't stacked under this one.
  const activate = (entry: Entry): void => {
    close()
    entry.run()
  }

  const move = (delta: number): void => {
    const next = Math.min(Math.max(index + delta, 0), entries.length - 1)
    setIndex(next)
    listRef.current?.querySelector(`[data-index="${next}"]`)?.scrollIntoView({ block: 'nearest' })
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.nativeEvent.isComposing) return // 한글 IME 조합 Enter가 검색 결과를 즉시 열지 않도록
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      move(1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      move(-1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const entry = entries[index]
      if (entry) activate(entry)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : close())}>
      <DialogContent className="top-[14%] max-w-xl translate-y-0 gap-0 p-0" hideClose>
        <div className="flex items-center gap-2.5 border-b border-border px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            placeholder="작업, 카테고리, 데스크 검색"
            aria-label="검색"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            className="h-12 w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div ref={listRef} className="max-h-[22rem] overflow-y-auto p-1.5">
          {query.trim() && entries.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              ‘{query.trim()}’와 일치하는 항목이 없습니다.
            </p>
          )}
          {entries.map((entry, i) => (
            <div key={entry.key}>
              {entry.group !== entries[i - 1]?.group && (
                <p className="px-2.5 pb-1 pt-2.5 text-xs font-medium text-muted-foreground">
                  {entry.group}
                </p>
              )}
              <button
                data-index={i}
                onClick={() => activate(entry)}
                onMouseMove={() => setIndex(i)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left',
                  i === index && 'bg-accent'
                )}
              >
                <entry.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                {entry.color && (
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{entry.title}</span>
                  {entry.subtitle && (
                    <span className="block truncate text-xs text-muted-foreground">{entry.subtitle}</span>
                  )}
                </span>
                {entry.hint && <kbd className="font-sans text-xs text-muted-foreground">{entry.hint}</kbd>}
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-xs text-muted-foreground">
          <span>
            <kbd className="font-sans">↑↓</kbd> 이동
          </span>
          <span>
            <kbd className="font-sans">Enter</kbd> 열기
          </span>
          <span>
            <kbd className="font-sans">Esc</kbd> 닫기
          </span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
