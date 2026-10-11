import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  ListTodo,
  NotebookPen,
  CalendarDays,
  Target,
  FolderArchive,
  FolderGit2,
  Table2,
  type LucideIcon
} from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { SidebarExpandButton } from './Sidebar'
import { TaskPanel } from './TaskPanel'
import { NotesView } from './NotesView'
import { CalendarView } from './CalendarView'
import { GoalsView } from './GoalsView'
import { DocumentsView } from './DocumentsView'
import { SmartView } from './SmartView'
import { TrashView } from './TrashView'
import { SettingsView } from './SettingsView'
import { GraphView } from './GraphView'
import { ProjectView } from './ProjectView'
import { ProjectsView } from './ProjectsView'
import { AskView } from './AskView'
import { DeskDatabase } from './DeskDatabase'
import { ToolsView } from './tools/ToolsView'
import { PageHeader } from './PageHeader'
import type { MainView } from '@/store/useStore'
import { applyDeskAccent } from '@/lib/deskAccent'
import { ancestorsOf } from '@shared/tree'
import type { Workspace } from '@shared/types'

const VIEWS: { value: MainView; label: string; icon: LucideIcon }[] = [
  { value: 'tasks', label: '작업', icon: ListTodo },
  { value: 'notes', label: '메모', icon: NotebookPen },
  { value: 'database', label: '데이터베이스', icon: Table2 },
  { value: 'calendar', label: '달력', icon: CalendarDays },
  { value: 'goals', label: '목표', icon: Target },
  { value: 'documents', label: '문서', icon: FolderArchive },
  { value: 'project', label: '프로젝트', icon: FolderGit2 }
]

export function MainArea(): JSX.Element {
  const workspaces = useStore((s) => s.workspaces)
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId)
  const smartView = useStore((s) => s.smartView)
  const mainView = useStore((s) => s.mainView)
  const setMainView = useStore((s) => s.setMainView)
  const loading = useStore((s) => s.loading)
  const utilityView = useStore((s) => s.utilityView)
  const theme = useStore((s) => s.theme)

  // Inside a desk, its colour is the accent; global views keep the app's own.
  const accent = utilityView || smartView ? null : (workspaces.find((w) => w.id === activeWorkspaceId)?.color ?? null)
  useEffect(() => applyDeskAccent(accent), [accent, theme])

  if (utilityView) {
    return (
      <main className="glass-panel glass-pane flex min-w-0 flex-1 flex-col">
        {utilityView === 'trash' && <TrashView />}
        {utilityView === 'settings' && <SettingsView />}
        {utilityView === 'graph' && <GraphView />}
        {utilityView === 'projects' && <ProjectsView />}
        {utilityView === 'ask' && <AskView />}
        {utilityView === 'calendar' && (
          <div className="flex h-full flex-col">
            <PageHeader icon={CalendarDays} title="통합 달력" />
            <div className="min-h-0 flex-1">
              <CalendarView unified />
            </div>
          </div>
        )}
        {utilityView === 'tools' && <ToolsView />}
      </main>
    )
  }

  // Smart views ("오늘"/"이번 주") span all desks and replace the desk layout.
  if (smartView) {
    return (
      <main className="glass-panel glass-pane flex min-w-0 flex-1 flex-col">
        <SmartView />
      </main>
    )
  }

  const desk = workspaces.find((w) => w.id === activeWorkspaceId) ?? null

  if (!desk) {
    return (
      <main className="glass-panel glass-pane flex min-w-0 flex-1 flex-col">
        <div className="drag-region flex h-12 shrink-0 items-center px-3">
          <SidebarExpandButton />
        </div>
        {!loading && workspaces.length === 0 ? (
          <FirstDesk />
        ) : (
          <p className="m-auto text-sm text-muted-foreground">왼쪽에서 데스크를 선택하세요.</p>
        )}
      </main>
    )
  }

  return (
    <main className="glass-pane flex min-w-0 flex-1 flex-col">
      {/* items-stretch so the tab indicator sits exactly on the header's bottom border */}
      <header className="cq glass-chrome drag-region flex h-12 shrink-0 items-stretch gap-3 overflow-hidden border-b border-border px-3">
        <DeskTitle desk={desk} workspaces={workspaces} />
        <span aria-hidden className="my-auto h-4 w-px bg-border" />
        <ViewTabs value={mainView} onChange={setMainView} />
      </header>

      {/* Keyed on view + desk: switching either fades the new content in instead of snapping. */}
      <div key={`${desk.id}:${mainView}`} className="glass-panel flex-1 animate-view-in overflow-hidden">
        {mainView === 'tasks' && <TaskPanel />}
        {mainView === 'notes' && <NotesView key={desk.id} />}
        {mainView === 'database' && <DeskDatabase key={desk.id} deskId={desk.id} />}
        {mainView === 'calendar' && <CalendarView />}
        {mainView === 'goals' && <GoalsView />}
        {mainView === 'documents' && <DocumentsView />}
        {mainView === 'project' && <ProjectView desk={desk} />}
      </div>
    </main>
  )
}

/** The desk's identity: a tile in its colour (emoji or initial), sub-desk path, name. */
function DeskTitle({ desk, workspaces }: { desk: Workspace; workspaces: Workspace[] }): JSX.Element {
  const path = ancestorsOf(workspaces, desk.id)
  const selectWorkspace = useStore((s) => s.selectWorkspace)
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <SidebarExpandButton />
      <span
        key={desk.id}
        aria-hidden
        className="flex h-7 w-7 shrink-0 animate-pop-in items-center justify-center rounded-lg bg-desk/15 text-[15px] font-semibold leading-none text-desk ring-1 ring-inset ring-desk/20"
      >
        {desk.icon || [...desk.name][0]}
      </span>
      <div className="flex min-w-0 items-baseline gap-1">
        {path.map((p) => (
          <span key={p.id} className="no-drag flex shrink-0 items-baseline gap-1 text-[13px] text-muted-foreground">
            <button onClick={() => void selectWorkspace(p.id)} className="max-w-[8rem] truncate hover:text-foreground">
              {p.name}
            </button>
            <span aria-hidden className="text-muted-foreground/50">/</span>
          </span>
        ))}
        <h1 className="max-w-[16rem] truncate text-[15px] font-semibold tracking-[-0.02em]" title={desk.name}>
          {desk.name}
        </h1>
      </div>
    </div>
  )
}

/** View tabs with one indicator that slides to the active tab, in the desk's colour. */
function ViewTabs({ value, onChange }: { value: MainView; onChange: (v: MainView) => void }): JSX.Element {
  const listRef = useRef<HTMLDivElement>(null)
  const [bar, setBar] = useState<{ x: number; w: number } | null>(null)

  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    const measure = (): void => {
      const el = list.querySelector<HTMLElement>('[data-state="active"]')
      if (el) setBar({ x: el.offsetLeft + 8, w: el.offsetWidth - 16 })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(list)
    return () => ro.disconnect()
  }, [value])

  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as MainView)} className="flex">
      <TabsList ref={listRef} className="no-drag relative h-full gap-0.5 rounded-none bg-transparent p-0">
        {VIEWS.map(({ value: v, label, icon: Icon }) => (
          <TabsTrigger
            key={v}
            value={v}
            title={label}
            aria-label={label}
            className="h-full gap-1.5 rounded-none px-2.5 text-muted-foreground transition-colors duration-fast hover:text-foreground focus-visible:bg-accent/60 data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="cq-hide-md">{label}</span>
          </TabsTrigger>
        ))}
        {bar && (
          <span
            aria-hidden
            className="pointer-events-none absolute -bottom-px left-0 h-0.5 rounded-full bg-desk transition-[transform,width] duration-slow ease-out"
            style={{ width: bar.w, transform: `translateX(${bar.x}px)` }}
          />
        )}
      </TabsList>
    </Tabs>
  )
}

/** First-run: create the first desk right here instead of hunting for the sidebar button. */
function FirstDesk(): JSX.Element {
  const createWorkspace = useStore((s) => s.createWorkspace)
  const [name, setName] = useState('')

  const submit = (): void => {
    if (name.trim()) createWorkspace(name)
  }

  return (
    <div className="m-auto w-full max-w-sm px-6 pb-16">
      <h2 className="text-2xl font-bold tracking-tight">첫 데스크를 만드세요</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        데스크는 프로젝트나 업무 영역 단위입니다. 그 안에 작업, 메모, 목표, 문서를 모아 둡니다.
      </p>
      <form
        className="mt-6 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            // 한글 IME 조합 중 Enter가 미완성 이름으로 제출되지 않도록
            if (e.key === 'Enter' && e.nativeEvent.isComposing) e.preventDefault()
          }}
          placeholder="예: 마케팅, 신규 프로젝트"
          aria-label="데스크 이름"
          className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background/70 px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <Button type="submit" disabled={!name.trim()}>
          만들기
        </Button>
      </form>
    </div>
  )
}
