import { useMemo, useState } from 'react'
import { Plus, Trash2, CornerDownRight } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Category, Task } from '@shared/types'

interface CategoryRowProps {
  category: Category
  child?: boolean
  openCount: number
  active: boolean
  onSelect: () => void
  onAddChild?: () => void
  onDelete: () => void
}

function CategoryRow({
  category,
  child = false,
  openCount,
  active,
  onSelect,
  onAddChild,
  onDelete
}: CategoryRowProps): JSX.Element {
  return (
    <div
      className={cn(
        'group flex items-center gap-2 rounded-md py-1.5 pr-1 text-sm transition-colors',
        child ? 'pl-7' : 'pl-3',
        active
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
      )}
    >
      {child && <CornerDownRight className="h-3 w-3 shrink-0 opacity-40" />}
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
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

export function CategoryPanel(): JSX.Element {
  const categories = useStore((s) => s.categories)
  const tasks = useStore((s) => s.tasks)
  const activeCategoryId = useStore((s) => s.activeCategoryId)
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId)
  const selectCategory = useStore((s) => s.selectCategory)
  const createCategory = useStore((s) => s.createCategory)
  const deleteCategory = useStore((s) => s.deleteCategory)

  const [adding, setAdding] = useState<{ parentId: string | null } | null>(null)
  const [name, setName] = useState('')

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

  if (!activeWorkspaceId) {
    return <section className="w-64 shrink-0 border-r border-border" />
  }

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
        {tree.map(({ root, children }) => (
          <div key={root.id}>
            <CategoryRow
              category={root}
              active={root.id === activeCategoryId}
              openCount={openCount.get(root.id) ?? 0}
              onSelect={() => selectCategory(root.id)}
              onAddChild={() => startAdd(root.id)}
              onDelete={() => deleteCategory(root.id)}
            />
            {children.map((c) => (
              <CategoryRow
                key={c.id}
                category={c}
                child
                active={c.id === activeCategoryId}
                openCount={openCount.get(c.id) ?? 0}
                onSelect={() => selectCategory(c.id)}
                onDelete={() => deleteCategory(c.id)}
              />
            ))}
            {adding?.parentId === root.id && (
              <CategoryInput
                value={name}
                placeholder="하위 카테고리"
                indent
                onChange={setName}
                onSubmit={submit}
                onCancel={() => setAdding(null)}
              />
            )}
          </div>
        ))}

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
          if (e.key === 'Enter') onSubmit()
          if (e.key === 'Escape') onCancel()
        }}
        className="no-drag h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  )
}
