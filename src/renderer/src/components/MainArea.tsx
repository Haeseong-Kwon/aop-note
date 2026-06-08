import { ListTodo, CalendarDays, Target } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TaskPanel } from './TaskPanel'
import { CalendarView } from './CalendarView'
import { GoalsView } from './GoalsView'
import { SmartView } from './SmartView'
import type { MainView } from '@/store/useStore'

export function MainArea(): JSX.Element {
  const workspaces = useStore((s) => s.workspaces)
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId)
  const smartView = useStore((s) => s.smartView)
  const mainView = useStore((s) => s.mainView)
  const setMainView = useStore((s) => s.setMainView)

  // Smart views ("오늘"/"이번 주") span all desks and replace the desk layout.
  if (smartView) {
    return (
      <main className="flex flex-1 flex-col overflow-hidden">
        <SmartView />
      </main>
    )
  }

  const desk = workspaces.find((w) => w.id === activeWorkspaceId) ?? null

  if (!desk) {
    return (
      <main className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        좌측에서 데스크를 선택하거나 새로 만들어 주세요.
      </main>
    )
  }

  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      <header className="drag-region flex h-12 shrink-0 items-center gap-4 border-b border-border px-5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: desk.color }} />
          <h1 className="truncate text-sm font-semibold tracking-tight">{desk.name}</h1>
        </div>

        <div className="mx-auto">
          <Tabs value={mainView} onValueChange={(v) => setMainView(v as MainView)}>
            <TabsList className="no-drag">
              <TabsTrigger value="tasks" className="gap-1.5">
                <ListTodo className="h-3.5 w-3.5" />
                작업
              </TabsTrigger>
              <TabsTrigger value="calendar" className="gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />
                달력
              </TabsTrigger>
              <TabsTrigger value="goals" className="gap-1.5">
                <Target className="h-3.5 w-3.5" />
                목표
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* right spacer keeps the tabs centered */}
        <div className="w-[120px] shrink-0" />
      </header>

      <div className="flex-1 overflow-hidden">
        {mainView === 'tasks' && <TaskPanel />}
        {mainView === 'calendar' && <CalendarView />}
        {mainView === 'goals' && <GoalsView />}
      </div>
    </main>
  )
}
