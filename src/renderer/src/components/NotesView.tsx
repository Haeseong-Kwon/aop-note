import { useMemo, useState } from 'react'
import { Plus, Search, FileText, X, ChevronRight } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Button } from '@/components/ui/button'
import { NotePage } from './NotePage'
import { cn } from '@/lib/utils'
import { flattenTree, type TreeRow } from '@shared/tree'
import type { Task, TaskStatus } from '@shared/types'
import { ResizablePane } from '@/components/ui/ResizablePane'

const STATUS_DOT: Record<TaskStatus, string> = {
  todo: 'bg-slate-400',
  doing: 'bg-blue-400',
  done: 'bg-emerald-400'
}

/** First meaningful line of a memo, stripped of common Markdown noise. */
function memoPreview(note: string): string {
  const line = note
    .split('\n')
    .map((l) =>
      l
        .replace(/^[#>\s-]*(\[[ xX]\])?\s*/, '')
        .replace(/[*`_~]/g, '')
        .trim()
    )
    .find((l) => l.length > 0)
  return line ?? '비어 있음'
}

const INDENT_PX = 14

interface NoteListItemProps {
  row: TreeRow<Task>
  active: boolean
  collapsed: boolean
  onSelect: () => void
  onToggle: () => void
  onAddChild: () => void
}

function NoteListItem({ row, active, collapsed, onSelect, onToggle, onAddChild }: NoteListItemProps): JSX.Element {
  const { item: task, depth, hasChildren } = row
  return (
    <div
      className={cn(
        'group flex items-start rounded-md pr-1 transition-colors',
        active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
      )}
      style={{ paddingLeft: depth * INDENT_PX }}
    >
      <button
        onClick={onToggle}
        disabled={!hasChildren}
        aria-label={collapsed ? '하위 메모 펼치기' : '하위 메모 접기'}
        className="mt-2 flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent disabled:invisible"
      >
        <ChevronRight className={cn('h-3 w-3 transition-transform', !collapsed && 'rotate-90')} />
      </button>
      <button onClick={onSelect} className="flex min-w-0 flex-1 items-start gap-2 py-2 pl-1 text-left">
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_DOT[task.status])} />
            <span className={cn('truncate text-sm', task.status === 'done' && 'text-muted-foreground line-through')}>
              {task.title || '제목 없음'}
            </span>
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{memoPreview(task.note)}</span>
        </span>
      </button>
      <button
        onClick={onAddChild}
        title="하위 메모 추가"
        className="mt-1.5 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

/**
 * Top-level memo workspace: every note in the desk, grouped by category,
 * searchable, opened as a full page on the right.
 */
export function NotesView(): JSX.Element {
  const tasks = useStore((s) => s.tasks)
  const categories = useStore((s) => s.categories)
  const activeCategoryId = useStore((s) => s.activeCategoryId)
  const createTask = useStore((s) => s.createTask)
  // In the store so links, backlinks and the graph can open a specific note.
  const selectedId = useStore((s) => s.selectedNoteId)
  const setSelectedId = useStore((s) => s.selectNote)
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = q
      ? tasks.filter(
          (t) => t.title.toLowerCase().includes(q) || t.note.toLowerCase().includes(q)
        )
      : tasks
    return flattenTree(categories)
      .map(({ item: c }) => {
        const notes = matches.filter((t) => t.category_id === c.id)
        // Searching shows hits flat; otherwise sub-memos nest under their parent.
        const rows: TreeRow<Task>[] = q
          ? notes.map((item) => ({ item, depth: 0, hasChildren: false }))
          : flattenTree(notes, collapsed)
        return { category: c, notes, rows }
      })
      .filter((g) => g.notes.length > 0)
  }, [tasks, categories, query, collapsed])

  const toggle = (id: string): void =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })

  const newSubNote = async (parent: Task): Promise<void> => {
    const task = await createTask({ category_id: parent.category_id, parent_id: parent.id, title: '제목 없음' })
    if (!task) return
    setCollapsed((prev) => new Set([...prev].filter((id) => id !== parent.id)))
    setSelectedId(task.id)
  }

  const visible = groups.flatMap((g) => g.notes)
  const selected = visible.find((t) => t.id === selectedId) ?? visible[0] ?? null
  const selectedCategory = categories.find((c) => c.id === selected?.category_id)

  const newNote = async (): Promise<void> => {
    const categoryId = activeCategoryId ?? categories[0]?.id
    if (!categoryId) return
    const task = await createTask({ category_id: categoryId, title: '제목 없음' })
    if (task) {
      setQuery('')
      setSelectedId(task.id)
    }
  }

  return (
    <div className="flex h-full">
      <ResizablePane
        as="aside"
        id="notes"
        label="메모 목록"
        min={200}
        max={520}
        fallback={256}
        className="glass-chrome flex flex-col border-r border-border"
      >
        <div className="space-y-2 border-b border-border p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="메모 검색"
              className="w-full rounded-md bg-muted/60 py-1.5 pl-8 pr-7 text-sm outline-none ring-ring placeholder:text-muted-foreground focus:ring-1"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Button
            size="sm"
            className="w-full"
            onClick={() => void newNote()}
            disabled={categories.length === 0}
          >
            <Plus className="h-4 w-4" />새 메모
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {groups.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              {query ? '검색 결과가 없습니다.' : '메모가 없습니다.'}
            </p>
          ) : (
            groups.map(({ category, notes, rows }) => (
              <div key={category.id} className="mb-3 last:mb-0">
                <p className="flex items-center gap-1.5 px-2 pb-1 text-xs font-medium text-muted-foreground">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: category.color }}
                  />
                  <span className="truncate">{category.name}</span>
                  <span className="ml-auto tabular-nums">{notes.length}</span>
                </p>
                <div className="space-y-0.5">
                  {rows.map((row) => (
                    <NoteListItem
                      key={row.item.id}
                      row={row}
                      active={row.item.id === selected?.id}
                      collapsed={collapsed.has(row.item.id)}
                      onSelect={() => setSelectedId(row.item.id)}
                      onToggle={() => toggle(row.item.id)}
                      onAddChild={() => void newSubNote(row.item)}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </ResizablePane>

      <div className="min-w-0 flex-1">
        {selected ? (
          <NotePage key={selected.id} task={selected} category={selectedCategory} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
            <FileText className="h-8 w-8 opacity-30" />
            {categories.length === 0
              ? '카테고리를 먼저 만들어 주세요.'
              : '왼쪽에서 메모를 선택하거나 새 메모를 만드세요.'}
          </div>
        )}
      </div>
    </div>
  )
}
