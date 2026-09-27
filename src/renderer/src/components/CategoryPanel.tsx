import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Plus, Trash2, ChevronRight, GripVertical } from 'lucide-react'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useStore } from '@/store/useStore'
import { Button } from '@/components/ui/button'
import { StylePicker } from './StylePicker'
import { cn } from '@/lib/utils'
import type { Category, Task, UpdateCategoryInput } from '@shared/types'
import { ResizablePane } from '@/components/ui/ResizablePane'

const INDENT_PX = 14

interface CategoryRowProps {
  category: Category
  depth: number
  openCount: number
  active: boolean
  /** undefined = no children (no chevron) */
  collapsed?: boolean
  handle?: ReactNode
  onToggle: () => void
  onSelect: () => void
  onAddChild: () => void
  onDelete: () => void
}

function CategoryRow({
  category,
  depth,
  openCount,
  active,
  collapsed,
  handle,
  onToggle,
  onSelect,
  onAddChild,
  onDelete
}: CategoryRowProps): JSX.Element {
  const updateCategory = useStore((s) => s.updateCategory)
  const [pickerOpen, setPickerOpen] = useState(false)
  const dotBtnRef = useRef<HTMLButtonElement>(null)

  return (
    <div
      className={cn(
        'group relative flex h-[30px] items-center gap-1 rounded-md pl-1.5 pr-1 text-sm transition-colors',
        active
          ? 'bg-accent font-medium text-foreground'
          : 'text-foreground/80 hover:bg-accent/60 hover:text-foreground'
      )}
      style={{ paddingLeft: 6 + depth * INDENT_PX }}
    >
      {handle}
      <button
        onClick={onToggle}
        disabled={collapsed === undefined}
        aria-label={collapsed ? '펼치기' : '접기'}
        className="no-drag flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent disabled:invisible"
      >
        <ChevronRight className={cn('h-3 w-3 transition-transform', !collapsed && 'rotate-90')} />
      </button>
      <button
        ref={dotBtnRef}
        onClick={() => setPickerOpen((v) => !v)}
        title="색상 변경"
        className="no-drag flex h-4 w-4 items-center justify-center rounded transition-colors hover:bg-accent"
      >
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: category.color }} />
      </button>
      {pickerOpen && (
        <StylePicker
          anchorEl={dotBtnRef.current}
          color={category.color}
          onChange={(next) => updateCategory({ id: category.id, ...next })}
          onClose={() => setPickerOpen(false)}
        />
      )}
      <button onClick={onSelect} className="no-drag flex-1 truncate text-left">
        {category.name}
      </button>
      {openCount > 0 && (
        <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">
          {openCount}
        </span>
      )}
      <div className="flex items-center opacity-0 transition-opacity group-hover:opacity-100">
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onAddChild} title="하위 카테고리 추가">
          <Plus className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onDelete} title="삭제">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

function dragHandle(
  attributes: ReturnType<typeof useSortable>['attributes'],
  listeners: ReturnType<typeof useSortable>['listeners']
): JSX.Element {
  return (
    <button
      {...attributes}
      {...listeners}
      title="드래그하여 순서 변경"
      className="no-drag cursor-grab touch-none text-muted-foreground/30 opacity-0 transition hover:text-foreground group-hover:opacity-100 active:cursor-grabbing"
    >
      <GripVertical className="h-3.5 w-3.5" />
    </button>
  )
}

interface CategoryNodeProps {
  category: Category
  depth: number
  childrenOf: Map<string | null, Category[]>
  collapsed: ReadonlySet<string>
  activeCategoryId: string | null
  openCount: Map<string, number>
  addingParentId: string | null | undefined
  renderInput: (depth: number) => ReactNode
  onToggle: (id: string) => void
  onSelect: (id: string) => void
  onAddChild: (id: string) => void
  onDelete: (id: string) => void
}

// A sortable folder with its (independently sortable) sub-folders, to any depth.
function CategoryNode(props: CategoryNodeProps): JSX.Element {
  const { category, depth, childrenOf, collapsed, addingParentId } = props
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id
  })
  const children = childrenOf.get(category.id) ?? []
  const isCollapsed = collapsed.has(category.id)

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? 'relative z-10 opacity-80' : ''}
    >
      <CategoryRow
        category={category}
        depth={depth}
        active={category.id === props.activeCategoryId}
        openCount={props.openCount.get(category.id) ?? 0}
        collapsed={children.length > 0 ? isCollapsed : undefined}
        handle={dragHandle(attributes, listeners)}
        onToggle={() => props.onToggle(category.id)}
        onSelect={() => props.onSelect(category.id)}
        onAddChild={() => props.onAddChild(category.id)}
        onDelete={() => props.onDelete(category.id)}
      />
      {!isCollapsed && (
        <SortableContext items={children.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {children.map((c) => (
            <CategoryNode key={c.id} {...props} category={c} depth={depth + 1} />
          ))}
        </SortableContext>
      )}
      {addingParentId === category.id && props.renderInput(depth + 1)}
    </div>
  )
}

export function CategoryPanel(): JSX.Element {
  const categories = useStore((s) => s.categories)
  const tasks = useStore((s) => s.tasks)
  const activeCategoryId = useStore((s) => s.activeCategoryId)
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId)
  const selectCategory = useStore((s) => s.selectCategory)
  const createCategory = useStore((s) => s.createCategory)
  const deleteCategory = useStore((s) => s.deleteCategory)
  const reorderCategories = useStore((s) => s.reorderCategories)

  const [adding, setAdding] = useState<{ parentId: string | null } | null>(null)
  const [name, setName] = useState('')
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const childrenOf = useMemo(() => {
    const map = new Map<string | null, Category[]>()
    categories.forEach((c) => map.set(c.parent_id ?? null, [...(map.get(c.parent_id ?? null) ?? []), c]))
    return map
  }, [categories])

  const toggle = (id: string): void =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })

  const openCount = useMemo(() => {
    const map = new Map<string, number>()
    tasks.forEach((t: Task) => {
      if (t.status !== 'done') map.set(t.category_id, (map.get(t.category_id) ?? 0) + 1)
    })
    return map
  }, [tasks])

  const submit = async (): Promise<void> => {
    if (!adding) return
    await createCategory({ name, parent_id: adding.parentId })
    setName('')
    setAdding(null)
  }

  const startAdd = (parentId: string | null): void => {
    setAdding({ parentId })
    setName('')
    // Show where the new sub-folder lands.
    if (parentId) setCollapsed((prev) => new Set([...prev].filter((id) => id !== parentId)))
  }

  // Reorder a folder among its own siblings (same parent).
  const onDragEnd = (e: DragEndEvent): void => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const activeCat = categories.find((c) => c.id === active.id)
    const overCat = categories.find((c) => c.id === over.id)
    if (!activeCat || !overCat) return

    const group = (parentId: string | null): Category[] =>
      categories.filter((c) => (c.parent_id ?? null) === parentId)

    if ((activeCat.parent_id ?? null) !== (overCat.parent_id ?? null)) return // no cross-group moves

    const siblings = group(activeCat.parent_id ?? null)
    const from = siblings.findIndex((c) => c.id === active.id)
    const to = siblings.findIndex((c) => c.id === over.id)
    if (from < 0 || to < 0) return
    const reordered = arrayMove(siblings, from, to)
    const updates: UpdateCategoryInput[] = reordered.map((c, i) => ({ id: c.id, sort_order: i }))
    reorderCategories(updates)
  }

  if (!activeWorkspaceId) {
    return <section className="w-64 shrink-0 border-r border-border" />
  }

  const roots = childrenOf.get(null) ?? []

  return (
    <ResizablePane
      as="section"
      id="categories"
      label="카테고리 패널"
      min={200}
      max={480}
      fallback={256}
      className="glass-chrome flex flex-col border-r border-border"
    >
      <div className="drag-region flex h-12 items-center justify-between px-4">
        <h2 className="no-drag text-sm font-semibold tracking-tight">카테고리</h2>
        <Button
          size="icon"
          variant="ghost"
          className="no-drag h-7 w-7"
          onClick={() => startAdd(null)}
          title="새 카테고리"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={roots.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            {roots.map((root) => (
              <CategoryNode
                key={root.id}
                category={root}
                depth={0}
                childrenOf={childrenOf}
                collapsed={collapsed}
                activeCategoryId={activeCategoryId}
                openCount={openCount}
                addingParentId={adding?.parentId}
                renderInput={(depth) => (
                  <CategoryInput
                    value={name}
                    placeholder="하위 카테고리"
                    depth={depth}
                    onChange={setName}
                    onSubmit={submit}
                    onCancel={() => setAdding(null)}
                  />
                )}
                onToggle={toggle}
                onSelect={selectCategory}
                onAddChild={startAdd}
                onDelete={deleteCategory}
              />
            ))}
          </SortableContext>
        </DndContext>

        {adding?.parentId === null && (
          <CategoryInput
            value={name}
            placeholder="카테고리 이름"
            onChange={setName}
            onSubmit={submit}
            onCancel={() => setAdding(null)}
          />
        )}

        {categories.length === 0 && adding === null && (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            카테고리를 추가해 작업을 정리하세요.
          </p>
        )}
      </div>
    </ResizablePane>
  )
}

interface CategoryInputProps {
  value: string
  placeholder: string
  depth?: number
  onChange: (v: string) => void
  onSubmit: () => void
  onCancel: () => void
}

function CategoryInput({
  value,
  placeholder,
  depth = 0,
  onChange,
  onSubmit,
  onCancel
}: CategoryInputProps): JSX.Element {
  return (
    <div className="py-1 pr-1" style={{ paddingLeft: 8 + depth * INDENT_PX }}>
      <input
        autoFocus
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCancel}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return // 한글 IME 조합 Enter 무시 (중복 생성 방지)
          if (e.key === 'Enter') onSubmit()
          if (e.key === 'Escape') onCancel()
        }}
        className="no-drag h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  )
}
