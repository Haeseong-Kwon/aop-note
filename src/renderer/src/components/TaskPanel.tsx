import { useMemo } from 'react'
import { Plus, LayoutList, Columns3, Eye, EyeOff } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CategoryPanel } from './CategoryPanel'
import { GoalStrip } from './GoalStrip'
import { ListView } from './ListView'
import { KanbanView } from './KanbanView'
import { sortTasks, type TaskSort } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { ViewMode } from '@/store/useStore'

export function TaskPanel(): JSX.Element {
  const tasks = useStore((s) => s.tasks)
  const categories = useStore((s) => s.categories)
  const activeCategoryId = useStore((s) => s.activeCategoryId)
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const openQuickCapture = useStore((s) => s.openQuickCapture)
  const listPrefs = useStore((s) => s.listPrefs)
  const setListPrefs = useStore((s) => s.setListPrefs)

  const activeCategory = categories.find((c) => c.id === activeCategoryId) ?? null

  const visibleTasks = useMemo(
    () => tasks.filter((t) => t.category_id === activeCategoryId),
    [tasks, activeCategoryId]
  )
  // Filter + sort apply to the list only; the kanban's columns already group by status.
  const listTasks = useMemo(() => {
    const shown = listPrefs.hideDone ? visibleTasks.filter((t) => t.status !== 'done') : visibleTasks
    return sortTasks(shown, listPrefs.sort)
  }, [visibleTasks, listPrefs])
  const hiddenDone = visibleTasks.length - listTasks.length

  return (
    <div className="flex h-full">
      <CategoryPanel />

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-5">
          <div className="flex min-w-0 items-center gap-2">
            {activeCategory && (
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: activeCategory.color }}
              />
            )}
            <h2 className="truncate text-[15px] font-semibold tracking-tight">
              {activeCategory?.name ?? '카테고리를 선택하세요'}
            </h2>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {view === 'list' && activeCategory && (
              <>
                <select
                  value={listPrefs.sort}
                  onChange={(e) => setListPrefs({ sort: e.target.value as TaskSort })}
                  aria-label="정렬"
                  className="h-8 rounded-md border border-input bg-background/60 px-2 text-xs text-muted-foreground outline-none hover:text-foreground focus:ring-2 focus:ring-ring"
                >
                  <option value="manual">직접 정렬</option>
                  <option value="due">기한순</option>
                  <option value="priority">우선순위순</option>
                </select>
                <button
                  onClick={() => setListPrefs({ hideDone: !listPrefs.hideDone })}
                  aria-pressed={listPrefs.hideDone}
                  title={listPrefs.hideDone ? '완료된 작업 보이기' : '완료된 작업 숨기기'}
                  className={cn(
                    'flex h-8 items-center gap-1.5 rounded-md px-2 text-xs transition-colors hover:bg-accent',
                    listPrefs.hideDone ? 'text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {listPrefs.hideDone ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  {listPrefs.hideDone ? `완료 ${hiddenDone}개 숨김` : '완료 표시'}
                </button>
              </>
            )}
            <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
              <TabsList>
                <TabsTrigger value="list" className="gap-1.5">
                  <LayoutList className="h-3.5 w-3.5" />
                  리스트
                </TabsTrigger>
                <TabsTrigger value="kanban" className="gap-1.5">
                  <Columns3 className="h-3.5 w-3.5" />
                  칸반
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Button size="sm" onClick={() => openQuickCapture()} disabled={!activeCategory}>
              <Plus className="h-4 w-4" />새 작업
            </Button>
          </div>
        </div>

        <GoalStrip />

        <div className="flex-1 overflow-hidden">
          {!activeCategory ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              카테고리를 선택하면 작업이 표시됩니다.
            </div>
          ) : view === 'list' ? (
            <ListView
              tasks={listTasks}
              reorderable={listPrefs.sort === 'manual'}
              hiddenDone={hiddenDone}
            />
          ) : (
            <KanbanView tasks={visibleTasks} />
          )}
        </div>
      </section>
    </div>
  )
}
