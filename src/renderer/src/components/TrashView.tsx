import { useEffect, useMemo, useState } from 'react'
import { Trash2, LayoutGrid, Folder, CheckSquare, RotateCcw, Search } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { toastError } from '@/store/useToast'
import { formatRelative } from '@/lib/format'
import { PageHeader } from './PageHeader'
import type { TrashItem, TrashKind } from '@shared/types'

const KIND_META: Record<TrashKind, { icon: typeof Folder; label: string }> = {
  workspace: { icon: LayoutGrid, label: '데스크' },
  category: { icon: Folder, label: '카테고리' },
  task: { icon: CheckSquare, label: '작업' }
}

export function TrashView(): JSX.Element {
  const restoreFromTrash = useStore((s) => s.restoreFromTrash)
  const [items, setItems] = useState<TrashItem[] | null>(null)
  const [filter, setFilter] = useState('')

  const load = (): void => {
    window.api.trash.list().then(setItems, toastError)
  }
  useEffect(load, [])

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!items || !q) return items ?? []
    return items.filter((i) => `${i.title} ${i.context}`.toLowerCase().includes(q))
  }, [items, filter])

  const restore = async (item: TrashItem): Promise<void> => {
    await restoreFromTrash(item.kind, item.id)
    load()
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={Trash2} title="휴지통" count={items?.length} />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-8 py-6">
          <p className="text-sm text-muted-foreground">
            삭제한 데스크, 카테고리, 작업이 여기에 보관됩니다. 복원하면 원래 자리로 돌아갑니다.
          </p>

          {items && items.length > 0 && (
            <label className="mt-5 flex h-9 items-center gap-2 rounded-md border border-input bg-background/60 px-3 focus-within:ring-2 focus-within:ring-ring">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="휴지통에서 찾기"
                aria-label="휴지통에서 찾기"
                className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </label>
          )}

          {items?.length === 0 && (
            <div className="mt-16 flex flex-col items-center gap-2 text-sm text-muted-foreground">
              <Trash2 className="h-8 w-8 opacity-40" />
              휴지통이 비어 있습니다.
            </div>
          )}

          <ul className="mt-3 divide-y divide-border">
            {visible.map((item) => {
              const { icon: Icon, label } = KIND_META[item.kind]
              const extra = item.kind !== 'task' && item.task_count > 0 ? ` · 작업 ${item.task_count}개` : ''
              return (
                <li key={`${item.kind}-${item.id}`} className="group flex items-center gap-3 py-2.5">
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-label={label} />
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{item.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.context ? `${item.context} · ` : ''}
                      {label}
                      {extra}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {formatRelative(item.deleted_at)}
                  </span>
                  <button
                    onClick={() => restore(item)}
                    className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    복원
                  </button>
                </li>
              )
            })}
          </ul>

          {filter.trim() && items && items.length > 0 && visible.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              ‘{filter.trim()}’와 일치하는 항목이 없습니다.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
