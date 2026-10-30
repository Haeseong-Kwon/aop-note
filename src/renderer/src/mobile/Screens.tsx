import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, FileText, Folder, LayoutGrid, ListTodo, Search, X } from 'lucide-react'
import { useStore, type SmartView, type UtilityView } from '@/store/useStore'
import { NotePage } from '@/components/NotePage'
import { CalendarView } from '@/components/CalendarView'
import { TrashView } from '@/components/TrashView'
import { SettingsView } from '@/components/SettingsView'
import { GraphView } from '@/components/GraphView'
import { AskView } from '@/components/AskView'
import { ToolsView } from '@/components/tools/ToolsView'
import { useCalendarEvents } from '@/hooks/useCalendarEvents'
import { daysUntil, endOfTodayIso, endOfWeekIso, formatEventTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { IconButton, Row, SectionLabel, TopBar } from './ui'
import { MobileTaskRow } from './DeskLists'
import { useNav } from './nav'
import type { SearchHit } from '@shared/types'

/** A memo as a full-screen page. Leaves by itself when the memo is deleted. */
export function MemoScreen({ id, workspaceId }: { id: string; workspaceId: string | null }): JSX.Element {
  const task = useStore((s) => s.tasks.find((t) => t.id === id) ?? s.smartTasks.find((t) => t.id === id))
  const categories = useStore((s) => s.categories)
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId)
  const selectWorkspace = useStore((s) => s.selectWorkspace)
  const pop = useNav((s) => s.pop)
  const seen = useRef(false)

  // Category, sub-memos and links come from the open desk: open this memo's desk.
  useEffect(() => {
    if (workspaceId && activeWorkspaceId !== workspaceId) void selectWorkspace(workspaceId)
  }, [workspaceId, activeWorkspaceId, selectWorkspace])

  useEffect(() => {
    if (task) seen.current = true
    else if (seen.current) pop()
  }, [task, pop])

  const back = <IconButton icon={ChevronLeft} label="뒤로" onClick={() => pop()} className="-ml-3" iconClassName="h-6 w-6" />
  if (!task) {
    return (
      <div className="flex h-full flex-col">
        <TopBar back />
        <p className="m-auto text-[15px] text-muted-foreground">메모를 불러오는 중…</p>
      </div>
    )
  }
  return <NotePage key={task.id} task={task} category={categories.find((c) => c.id === task.category_id)} leading={back} />
}

const SMART_VIEWS: { value: SmartView; label: string }[] = [
  { value: 'today', label: '오늘' },
  { value: 'week', label: '이번 주' }
]

/** Today tab: due and overdue tasks across every desk, plus subscribed-calendar events. */
export function TodayScreen(): JSX.Element {
  const smartView = useStore((s) => s.smartView)
  const smartTasks = useStore((s) => s.smartTasks)
  const selectSmartView = useStore((s) => s.selectSmartView)
  const [view, setView] = useState<SmartView>(smartView ?? 'today')

  // Desk pages share the store; re-load this list whenever the tab is shown.
  useEffect(() => {
    void selectSmartView(view)
  }, [view, selectSmartView])

  const now = new Date()
  const { events } = useCalendarEvents(
    new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    new Date(view === 'today' ? endOfTodayIso() : endOfWeekIso())
  )
  const overdue = smartTasks.filter((t) => t.status !== 'done' && t.due_date && daysUntil(t.due_date) < 0)
  const rest = smartTasks.filter((t) => !overdue.includes(t))
  const context = (t: (typeof smartTasks)[number]): string => `${t.workspace_name} · ${t.category_name}`

  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 px-4 pb-2 pt-4">
        <h1 className="text-[26px] font-bold tracking-tight">{view === 'today' ? '오늘' : '이번 주'}</h1>
        <p className="mt-0.5 text-[14px] text-muted-foreground">
          {now.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })}
        </p>
        <div className="mt-3 flex rounded-xl bg-muted p-1">
          {SMART_VIEWS.map((v) => (
            <button
              key={v.value}
              onClick={() => setView(v.value)}
              aria-pressed={view === v.value}
              className={cn('h-9 flex-1 rounded-lg text-[14px]', view === v.value ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground')}
            >
              {v.label}
            </button>
          ))}
        </div>
      </header>
      <div className="flex-1 overflow-y-auto pb-6">
        {events.length > 0 && (
          <>
            <SectionLabel>일정</SectionLabel>
            {events.map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-5 py-2.5">
                <span className="h-9 w-1 shrink-0 rounded-full" style={{ backgroundColor: e.color }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px]">{e.title}</span>
                  <span className="block text-[13px] text-muted-foreground">{formatEventTime(e)}{e.location ? ` · ${e.location}` : ''}</span>
                </span>
              </div>
            ))}
          </>
        )}
        {overdue.length > 0 && <SectionLabel>기한 지남</SectionLabel>}
        {overdue.map((t) => (
          <MobileTaskRow key={t.id} task={t} context={context(t)} />
        ))}
        {overdue.length > 0 && rest.length > 0 && <SectionLabel>할 일</SectionLabel>}
        {rest.map((t) => (
          <MobileTaskRow key={t.id} task={t} context={context(t)} />
        ))}
        {smartTasks.length === 0 && events.length === 0 && (
          <p className="px-8 py-16 text-center text-[15px] text-muted-foreground">
            {view === 'today' ? '오늘 기한인 작업이 없습니다.' : '이번 주 기한인 작업이 없습니다.'}
          </p>
        )}
      </div>
    </div>
  )
}

export function CalendarScreen(): JSX.Element {
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        <CalendarView unified />
      </div>
    </div>
  )
}

const HIT_ICON = { task: ListTodo, category: Folder, workspace: LayoutGrid, document: FileText } as const

/** Search tab: memos, tasks, categories, desks and document text. */
export function SearchScreen(): JSX.Element {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const reqId = useRef(0)
  const push = useNav((s) => s.push)
  const previewDocument = useStore((s) => s.previewDocument)
  const selectCategory = useStore((s) => s.selectCategory)
  const setMainView = useStore((s) => s.setMainView)
  const selectWorkspace = useStore((s) => s.selectWorkspace)

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setHits([])
      return
    }
    const id = ++reqId.current
    void window.api.search.query(q).then((r) => id === reqId.current && setHits(r))
  }, [query])

  const open = async (hit: SearchHit): Promise<void> => {
    if (hit.type === 'task') push({ name: 'memo', id: hit.id, workspaceId: hit.workspace_id })
    else if (hit.type === 'document') previewDocument(hit.id, hit.title)
    else {
      await selectWorkspace(hit.workspace_id)
      if (hit.type === 'category' && hit.category_id) {
        setMainView('tasks')
        selectCategory(hit.category_id)
      }
      push({ name: 'desk', id: hit.workspace_id })
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 px-4 pb-2 pt-4">
        <h1 className="mb-3 text-[26px] font-bold tracking-tight">검색</h1>
        <label className="flex h-12 items-center gap-2 rounded-xl bg-muted px-3">
          <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            type="search"
            enterKeyHint="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="메모, 작업, 데스크, 문서 내용"
            className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button onClick={() => setQuery('')} aria-label="지우기" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </label>
      </div>
      <div className="flex-1 overflow-y-auto pb-6">
        {hits.map((hit) => {
          const Icon = HIT_ICON[hit.type]
          return (
            <Row
              key={`${hit.type}-${hit.id}`}
              icon={<Icon className="h-5 w-5" style={{ color: hit.color }} />}
              label={hit.title || '제목 없음'}
              detail={hit.subtitle}
              onClick={() => void open(hit)}
            />
          )
        })}
        {query.trim() && hits.length === 0 && <p className="px-8 py-12 text-center text-[15px] text-muted-foreground">'{query.trim()}'에 맞는 결과가 없습니다.</p>}
      </div>
    </div>
  )
}

const UTILITY: Partial<Record<UtilityView, () => JSX.Element>> = {
  trash: TrashView,
  settings: SettingsView,
  graph: GraphView,
  ask: AskView,
  tools: ToolsView
}

/** App-wide pages (settings, trash, graph, AI, tools); each brings its own header with a back button. */
export function UtilityScreen({ view }: { view: UtilityView }): JSX.Element {
  const Page = UTILITY[view]
  if (!Page) return <TopBar back title="모바일에서 지원하지 않는 화면입니다" />
  return <Page />
}
