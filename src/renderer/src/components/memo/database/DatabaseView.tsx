import { useCallback, useEffect, useMemo, useState } from 'react'
import { FileText, Plus } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { toastError } from '@/store/useToast'
import { applyView, propertyOf, type Field, type ViewConfig, type ViewGroup } from '@/lib/database'
import { coverStyle } from '@/lib/covers'
import { cn } from '@/lib/utils'
import { parsePageMeta } from '@shared/pageMeta'
import { Toolbar, allFields, fieldLabel } from './Toolbar'
import { DueCell, OptionChip, PriorityCell, PropertyCell, StatusCell } from './cells'
import type { Category, DatabaseData, Priority, TaskStatus, TaskWithContext } from '@shared/types'

interface DatabaseViewProps {
  cfg: ViewConfig
  onConfig: (next: ViewConfig) => void
}

/** A Notion-style database over one desk's tasks: table / board / list / gallery. */
export function DatabaseView({ cfg, onConfig }: DatabaseViewProps): JSX.Element {
  const storeTasks = useStore((s) => s.tasks) // any task edit in the app → reload
  const updateTask = useStore((s) => s.updateTask)
  const openNote = useStore((s) => s.openNote)
  const [data, setData] = useState<DatabaseData | null>(null)
  const [categories, setCategories] = useState<Category[]>([])

  const load = useCallback((): void => {
    window.api.database.get(cfg.workspaceId).then(setData, toastError)
    window.api.category.listByWorkspace(cfg.workspaceId).then(setCategories, toastError)
  }, [cfg.workspaceId])
  useEffect(load, [load, storeTasks])

  const view = useMemo(() => (data ? applyView(data, cfg) : null), [data, cfg])
  const patch = (p: Partial<ViewConfig>): void => onConfig({ ...cfg, ...p })

  if (!data || !view) return <p className="py-3 text-sm text-muted-foreground">데이터베이스 불러오는 중…</p>

  const shown = allFields(data).filter((f) => f.field !== 'title' && !cfg.hidden.includes(f.field))

  const setTaskField = async (row: TaskWithContext, field: Field, value: unknown): Promise<void> => {
    try {
      if (field === 'status') await updateTask({ id: row.id, status: value as TaskStatus })
      else if (field === 'priority') await updateTask({ id: row.id, priority: value as Priority })
      else if (field === 'due') await updateTask({ id: row.id, due_date: (value as string | null) ?? null })
      else if (field.startsWith('prop:')) {
        await window.api.database.setValue(row.id, field.slice(5), value)
        load()
      }
    } catch (e) {
      toastError(e)
    }
  }

  /** New item in the view's category (or the desk's first), pre-set to a board column. */
  const create = async (group?: ViewGroup): Promise<void> => {
    const categoryId = cfg.categoryId ?? categories[0]?.id
    if (!categoryId) return toastError(new Error('먼저 이 데스크에 카테고리를 만드세요.'))
    try {
      const task = await window.api.task.create({
        category_id: categoryId,
        title: '제목 없음',
        ...(group && cfg.groupBy === 'status' ? { status: group.key as TaskStatus } : {}),
        ...(group && cfg.groupBy === 'priority' ? { priority: Number(group.key) as Priority } : {})
      })
      if (group && cfg.groupBy?.startsWith('prop:') && group.key) await window.api.database.setValue(task.id, cfg.groupBy.slice(5), group.key)
      await useStore.getState().refresh()
      load()
    } catch (e) {
      toastError(e)
    }
  }

  const open = (row: TaskWithContext): void => void openNote(row)

  const cell = (row: TaskWithContext, field: Field): JSX.Element => {
    if (field === 'status') return <StatusCell value={row.status} onChange={(v) => void setTaskField(row, 'status', v)} />
    if (field === 'priority') return <PriorityCell value={row.priority} onChange={(v) => void setTaskField(row, 'priority', v)} />
    if (field === 'due') return <DueCell value={row.due_date} onChange={(v) => void setTaskField(row, 'due', v)} />
    if (field === 'category') return <span className="truncate px-1.5 text-sm text-muted-foreground">{row.category_name}</span>
    const prop = propertyOf(field, data)
    if (!prop) return <span />
    return <PropertyCell property={prop} value={data.values[row.id]?.[prop.id]} onChange={(v) => void setTaskField(row, field, v)} />
  }

  const titleButton = (row: TaskWithContext, className?: string): JSX.Element => {
    const icon = parsePageMeta(row.page_meta).icon
    return (
      <button type="button" onClick={() => open(row)} title="열기" className={cn('flex min-w-0 items-center gap-1.5 text-left hover:underline', className)}>
        {icon ? <span className="shrink-0">{icon}</span> : <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        <span className={cn('truncate', row.status === 'done' && 'text-muted-foreground line-through')}>{row.title || '제목 없음'}</span>
      </button>
    )
  }

  /** Read-only summary of a card's visible properties (board / gallery). */
  const cardProps = (row: TaskWithContext): JSX.Element => (
    <div className="mt-1.5 flex flex-wrap gap-1 text-[11px]">
      {shown.map(({ field }) => {
        if (field === cfg.groupBy) return null
        const prop = propertyOf(field, data)
        const v = prop ? data.values[row.id]?.[prop.id] : undefined
        if (prop && (prop.type === 'select' || prop.type === 'multi_select') && v !== undefined) {
          return (Array.isArray(v) ? v : [String(v)]).map((name) => (
            <OptionChip key={`${field}${name}`} name={name} color={prop.options.find((o) => o.name === name)?.color} />
          ))
        }
        if (field === 'due' && row.due_date) {
          return (
            <span key={field} className="text-muted-foreground">
              {new Date(row.due_date).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
            </span>
          )
        }
        if (prop && v !== undefined && v !== false) return <span key={field} className="text-muted-foreground">{prop.name}: {v === true ? '✓' : String(v)}</span>
        return null
      })}
    </div>
  )

  return (
    <div className="bn-database w-full" onKeyDown={(e) => e.stopPropagation()}>
      <Toolbar cfg={cfg} data={data} categories={categories} onConfig={patch} onChanged={load} onNew={() => void create()} />

      {cfg.view === 'table' && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="min-w-[14rem] px-1.5 py-1.5 font-medium">제목</th>
                {shown.map((f) => (
                  <th key={f.field} className="min-w-[8rem] px-1.5 py-1.5 font-medium">
                    {f.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.rows.map((row) => (
                <tr key={row.id} className="border-b border-border/60 hover:bg-accent/30">
                  <td className="px-1.5 py-0.5">{titleButton(row)}</td>
                  {shown.map((f) => (
                    <td key={f.field} className="px-0.5 py-0.5">
                      {cell(row, f.field)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <NewRow onClick={() => void create()} count={view.rows.length} />
        </div>
      )}

      {cfg.view === 'board' && view.groups && (
        <div className="flex gap-3 overflow-x-auto pb-2 pt-2">
          {view.groups.map((g) => (
            <div
              key={g.key}
              className="w-60 shrink-0 rounded-lg bg-muted/40 p-2"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const id = e.dataTransfer.getData('text/aop-task')
                const row = data.tasks.find((t) => t.id === id)
                if (row && cfg.groupBy) {
                  const value = cfg.groupBy === 'priority' ? Number(g.key) : g.key || null
                  void setTaskField(row, cfg.groupBy, value)
                }
              }}
            >
              <p className="mb-2 flex items-center gap-1.5 px-1 text-xs font-medium text-muted-foreground">
                {g.color ? <OptionChip name={g.label} color={g.color} /> : g.label}
                <span className="tabular-nums">{g.rows.length}</span>
              </p>
              <div className="space-y-1.5">
                {g.rows.map((row) => (
                  <div
                    key={row.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/aop-task', row.id)}
                    className="cursor-grab rounded-md border border-border bg-background p-2 shadow-sm active:cursor-grabbing"
                  >
                    {titleButton(row, 'text-sm font-medium')}
                    {cardProps(row)}
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => void create(g)} className="mt-1.5 flex w-full items-center gap-1 rounded px-1 py-1 text-xs text-muted-foreground hover:bg-accent">
                <Plus className="h-3.5 w-3.5" />
                새로 만들기
              </button>
            </div>
          ))}
        </div>
      )}

      {cfg.view === 'list' && (
        <div className="pt-1">
          {(view.groups ?? [{ key: 'all', label: '', rows: view.rows }]).map((g) => (
            <div key={g.key} className="mb-2">
              {g.label && <p className="px-1 pb-1 pt-2 text-xs font-medium text-muted-foreground">{g.color ? <OptionChip name={g.label} color={g.color} /> : g.label} · {g.rows.length}</p>}
              {g.rows.map((row) => (
                <div key={row.id} className="flex items-center gap-3 rounded px-1 py-1 hover:bg-accent/40">
                  {titleButton(row, 'flex-1 text-sm')}
                  <div className="flex shrink-0 items-center gap-2">{cardProps(row)}</div>
                </div>
              ))}
            </div>
          ))}
          <NewRow onClick={() => void create()} count={view.rows.length} />
        </div>
      )}

      {cfg.view === 'gallery' && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-3 pt-2">
          {view.rows.map((row) => {
            const meta = parsePageMeta(row.page_meta)
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => open(row)}
                className="overflow-hidden rounded-lg border border-border bg-background text-left shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="h-24 bg-muted" style={meta.cover ? coverStyle(meta.cover, meta.coverPos) : undefined}>
                  {!meta.cover && (
                    <p className="line-clamp-4 p-2 text-[11px] leading-snug text-muted-foreground">{row.note.replace(/[#>*`[\]]/g, '').slice(0, 200)}</p>
                  )}
                </div>
                <div className="p-2">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                    {meta.icon && <span>{meta.icon}</span>}
                    <span className="truncate">{row.title || '제목 없음'}</span>
                  </p>
                  {cardProps(row)}
                </div>
              </button>
            )
          })}
          <button type="button" onClick={() => void create()} className="flex min-h-[8rem] items-center justify-center gap-1 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:bg-accent/40">
            <Plus className="h-4 w-4" />
            새로 만들기
          </button>
        </div>
      )}

      {view.rows.length === 0 && cfg.filters.length > 0 && (
        <p className="py-3 text-center text-xs text-muted-foreground">
          필터({cfg.filters.map((f) => fieldLabel(f.field, data)).join(', ')})에 맞는 항목이 없습니다.
        </p>
      )}
    </div>
  )
}

function NewRow({ onClick, count }: { onClick: () => void; count: number }): JSX.Element {
  return (
    <div className="flex items-center justify-between px-1.5 py-1 text-xs text-muted-foreground">
      <button type="button" onClick={onClick} className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-accent hover:text-foreground">
        <Plus className="h-3.5 w-3.5" />
        새로 만들기
      </button>
      <span className="tabular-nums">{count}개</span>
    </div>
  )
}
