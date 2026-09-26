import { useState } from 'react'
import {
  ListTodo,
  NotebookPen,
  CalendarDays,
  Target,
  FolderArchive,
  FolderGit2,
  type LucideIcon
} from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { DeskIcon } from './DeskIcon'
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
import type { MainView } from '@/store/useStore'

const VIEWS: { value: MainView; label: string; icon: LucideIcon }[] = [
  { value: 'tasks', label: '작업', icon: ListTodo },
  { value: 'notes', label: '메모', icon: NotebookPen },
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

  if (utilityView) {
    return (
      <main className="glass-panel glass-pane flex flex-1 flex-col">
        {utilityView === 'trash' && <TrashView />}
        {utilityView === 'settings' && <SettingsView />}
        {utilityView === 'graph' && <GraphView />}
      </main>
    )
  }

  // Smart views ("오늘"/"이번 주") span all desks and replace the desk layout.
  if (smartView) {
    return (
      <main className="glass-panel glass-pane flex flex-1 flex-col">
        <SmartView />
      </main>
    )
  }

  const desk = workspaces.find((w) => w.id === activeWorkspaceId) ?? null

  if (!desk) {
    return (
      <main className="glass-panel glass-pane flex flex-1 flex-col">
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
    <main className="glass-pane flex flex-1 flex-col">
      {/* items-stretch so the tab underline sits exactly on the header's bottom border */}
      <header className="glass-chrome drag-region flex h-12 shrink-0 items-stretch gap-3 border-b border-border px-3">
        <div className="flex min-w-0 items-center gap-2">
          <SidebarExpandButton />
          <DeskIcon color={desk.color} icon={desk.icon} />
          <h1 className="max-w-[16rem] truncate text-sm font-semibold tracking-tight">{desk.name}</h1>
        </div>

        <span aria-hidden className="my-auto h-4 w-px bg-border" />

        <Tabs value={mainView} onValueChange={(v) => setMainView(v as MainView)} className="flex">
          <TabsList className="no-drag h-full gap-0.5 rounded-none bg-transparent p-0">
            {VIEWS.map(({ value, label, icon: Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="relative h-full gap-1.5 rounded-none px-2.5 text-muted-foreground hover:text-foreground focus-visible:bg-accent/60 data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-transparent data-[state=active]:after:bg-foreground"
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </header>

      <div className="glass-panel flex-1 overflow-hidden">
        {mainView === 'tasks' && <TaskPanel />}
        {mainView === 'notes' && <NotesView key={desk.id} />}
        {mainView === 'calendar' && <CalendarView />}
        {mainView === 'goals' && <GoalsView />}
        {mainView === 'documents' && <DocumentsView />}
        {mainView === 'project' && <ProjectView desk={desk} />}
      </div>
    </main>
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
