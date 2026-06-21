import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Plus, Trash2, CornerDownRight, GripVertical } from 'lucide-react'
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

interface CategoryRowProps {
  category: Category
  child?: boolean
  openCount: number
  active: boolean
  handle?: ReactNode
  onSelect: () => void
  onAddChild?: () => void
  onDelete: () => void
}

function CategoryRow({
  category,
  child = false,
  openCount,
  active,
  handle,
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
        'group relative flex items-center gap-1.5 rounded-md py-1.5 pr-1 text-sm transition-colors',
        child ? 'pl-7' : 'pl-1.5',
        active
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
      )}
    >
      {handle}
      {child && <CornerDownRight className="h-3 w-3 shrink-0 opacity-40" />}
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
        {onAddChild && (
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onAddChild} title="하위 카테고리 추가">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        )}
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

// A sortable child category nested under its root.
function ChildRow({
  category,
  active,
  openCount,
  onSelect,
  onDelete
}: {
  category: Category
  active: boolean
  openCount: number
  onSelect: () => void
  onDelete: () => void
}): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id
  })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? 'relative z-10 opacity-80' : ''}
    >
      <CategoryRow
        category={category}
        child
        active={active}
        openCount={openCount}
        handle={dragHandle(attributes, listeners)}
        onSelect={onSelect}
        onDelete={onDelete}
      />
    </div>
  )
}

interface RootBlockProps {
  root: Category
  children: Category[]
  activeCategoryId: string | null
  openCount: Map<string, number>
  onSelect: (id: string) => void
  onAddChild: (id: string) => void
  onDelete: (id: string) => void
  addingNode: ReactNode
}

// Sortable wrapper for a root category and its (independently sortable) children.
function RootBlock({
  root,
  children,
  activeCategoryId,
  openCount,
  onSelect,
  onAddChild,
  onDelete,
  addingNode
}: RootBlockProps): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: root.id
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? 'relative z-10 opacity-80' : ''}
    >
      <CategoryRow
        category={root}
        active={root.id === activeCategoryId}
        openCount={openCount.get(root.id) ?? 0}
        handle={dragHandle(attributes, listeners)}
        onSelect={() => onSelect(root.id)}
        onAddChild={() => onAddChild(root.id)}
        onDelete={() => onDelete(root.id)}
      />
      <SortableContext items={children.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        {children.map((c) => (
          <ChildRow
            key={c.id}
            category={c}
            active={c.id === activeCategoryId}
            openCount={openCount.get(c.id) ?? 0}
            onSelect={() => onSelect(c.id)}
            onDelete={() => onDelete(c.id)}
          />
        ))}
      </SortableContext>
      {addingNode}
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
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // Build a 1-level tree: roots (parent_id null) + their direct children.
  const tree = useMemo(() => {
    const roots = categories.filter((c) => !c.parent_id)
    const childrenOf = (id: string): Category[] => categories.filter((c) => c.parent_id === id)
    return roots.map((root) => ({ root, children: childrenOf(root.id) }))
  }, [categories])

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
  }

  // Reorder roots among roots, or children among their own siblings (1-level only).
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

  const rootIds = tree.map((t) => t.root.id)

  return (
    <section className="flex w-64 shrink-0 flex-col border-r border-border bg-card/20">
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
          <SortableContext items={rootIds} strategy={verticalListSortingStrategy}>
            {tree.map(({ root, children }) => (
              <RootBlock
                key={root.id}
                root={root}
                children={children}
                activeCategoryId={activeCategoryId}
                openCount={openCount}
                onSelect={selectCategory}
                onAddChild={startAdd}
                onDelete={deleteCategory}
                addingNode={
                  adding?.parentId === root.id ? (
                    <CategoryInput
                      value={name}
                      placeholder="하위 카테고리"
                      indent
                      onChange={setName}
                      onSubmit={submit}
                      onCancel={() => setAdding(null)}
                    />
                  ) : null
                }
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
    </section>
  )
}

interface CategoryInputProps {
  value: string
  placeholder: string
  indent?: boolean
  onChange: (v: string) => void
  onSubmit: () => void
  onCancel: () => void
}

function CategoryInput({
  value,
  placeholder,
  indent = false,
  onChange,
  onSubmit,
  onCancel
}: CategoryInputProps): JSX.Element {
  return (
    <div className={cn('py-1', indent ? 'pl-7 pr-1' : 'px-2')}>
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
