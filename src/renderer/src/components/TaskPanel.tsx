import { useMemo } from 'react'
import { Plus, LayoutList, Columns3 } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CategoryPanel } from './CategoryPanel'
import { ListView } from './ListView'
import { KanbanView } from './KanbanView'
import type { ViewMode } from '@/store/useStore'

export function TaskPanel(): JSX.Element {
  const tasks = useStore((s) => s.tasks)
  const categories = useStore((s) => s.categories)
  const activeCategoryId = useStore((s) => s.activeCategoryId)
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const openQuickCapture = useStore((s) => s.openQuickCapture)

  const activeCategory = categories.find((c) => c.id === activeCategoryId) ?? null

  const visibleTasks = useMemo(
    () => tasks.filter((t) => t.category_id === activeCategoryId),
    [tasks, activeCategoryId]
  )

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
            <h2 className="truncate text-sm font-medium">
              {activeCategory?.name ?? '카테고리를 선택하세요'}
            </h2>
          </div>

          <div className="ml-auto flex items-center gap-2">
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
            <Button size="sm" onClick={openQuickCapture} disabled={!activeCategory}>
              <Plus className="h-4 w-4" />새 작업
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          {!activeCategory ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              카테고리를 선택하면 작업이 표시됩니다.
            </div>
          ) : view === 'list' ? (
            <ListView tasks={visibleTasks} />
          ) : (
            <KanbanView tasks={visibleTasks} />
          )}
        </div>
      </section>
    </div>
  )
}
