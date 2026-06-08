import { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  pointerWithin,
  type DragStartEvent,
  type DragEndEvent
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useStore } from '@/store/useStore'
import { PriorityBadge, DueBadge } from './TaskBadges'
import { TaskInlineEditor } from './TaskInlineEditor'
import { STATUS_META } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Task, TaskStatus, UpdateTaskInput } from '@shared/types'

const COLUMNS: TaskStatus[] = ['todo', 'doing', 'done']
const isStatus = (id: string): id is TaskStatus => (COLUMNS as string[]).includes(id)

type Columns = Record<TaskStatus, string[]>

function buildColumns(tasks: Task[]): Columns {
  const cols: Columns = { todo: [], doing: [], done: [] }
  COLUMNS.forEach((status) => {
    cols[status] = tasks
      .filter((t) => t.status === status)
      .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
      .map((t) => t.id)
  })
  return cols
}

function CardBody({ task }: { task: Task }): JSX.Element {
  return (
    <>
      <p className={cn('mb-2 text-sm', task.status === 'done' && 'line-through opacity-70')}>
        {task.title}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <PriorityBadge priority={task.priority} />
        <DueBadge due={task.due_date} />
      </div>
    </>
  )
}

function KanbanCard({ task }: { task: Task }): JSX.Element {
  const toggleExpand = useStore((s) => s.toggleExpand)
  const expanded = useStore((s) => s.expandedTaskId === task.id)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: expanded
  })

  const dragProps = expanded ? {} : { ...listeners, ...attributes }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...dragProps}
      className={cn(
        'no-drag rounded-lg border border-border bg-card shadow-sm transition-shadow',
        !expanded && 'cursor-grab active:cursor-grabbing hover:border-primary/40',
        isDragging && 'opacity-30'
      )}
    >
      <div className="p-3" onClick={() => toggleExpand(task.id)}>
        <CardBody task={task} />
      </div>
      {expanded && <TaskInlineEditor task={task} />}
    </div>
  )
}

function Column({ status, ids, tasks }: { status: TaskStatus; ids: string[]; tasks: Task[] }): JSX.Element {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const meta = STATUS_META[status]
  const byId = new Map(tasks.map((t) => [t.id, t]))

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="mb-2 flex items-center gap-2 px-1">
        <h3 className={cn('text-sm font-semibold', meta.className)}>{meta.label}</h3>
        <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">
          {ids.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'flex flex-1 flex-col gap-2 overflow-y-auto rounded-xl border border-dashed border-transparent p-2 transition-colors',
          isOver ? 'border-primary/50 bg-accent/40' : 'bg-muted/20'
        )}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {ids.map((id) => {
            const task = byId.get(id)
            return task ? <KanbanCard key={id} task={task} /> : null
          })}
        </SortableContext>
        {ids.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">비어 있음</p>
        )}
      </div>
    </div>
  )
}

export function KanbanView({ tasks }: { tasks: Task[] }): JSX.Element {
  const reorderTasks = useStore((s) => s.reorderTasks)
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const columns = buildColumns(tasks)
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const findContainer = (id: string): TaskStatus | null => {
    if (isStatus(id)) return id
    return COLUMNS.find((s) => columns[s].includes(id)) ?? null
  }

  const onDragStart = (e: DragStartEvent): void => setActiveId(String(e.active.id))

  const onDragEnd = (e: DragEndEvent): void => {
    setActiveId(null)
    const active = String(e.active.id)
    const over = e.over ? String(e.over.id) : null
    if (!over) return

    const source = findContainer(active)
    const target = isStatus(over) ? over : findContainer(over)
    if (!source || !target) return

    // Remove the dragged id from source, then insert into target at the drop point.
    const sourceArr = columns[source].filter((id) => id !== active)
    let targetArr = source === target ? sourceArr : columns[target].filter((id) => id !== active)
    const insertAt = isStatus(over)
      ? targetArr.length
      : (() => {
          const idx = targetArr.indexOf(over)
          return idx >= 0 ? idx : targetArr.length
        })()
    targetArr = [...targetArr.slice(0, insertAt), active, ...targetArr.slice(insertAt)]

    const next: Columns = { ...columns, [source]: sourceArr, [target]: targetArr }

    // Persist only what actually changed (status and/or sort_order).
    const updates: UpdateTaskInput[] = []
    COLUMNS.forEach((status) => {
      next[status].forEach((id, i) => {
        const t = byId.get(id)
        if (!t) return
        if (t.status !== status || t.sort_order !== i) updates.push({ id, sort_order: i, status })
      })
    })
    if (updates.length) reorderTasks(updates)
  }

  const activeTask = activeId ? byId.get(activeId) ?? null : null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="flex h-full gap-3 overflow-x-auto p-4">
        {COLUMNS.map((status) => (
          <Column key={status} status={status} ids={columns[status]} tasks={tasks} />
        ))}
      </div>
      <DragOverlay>
        {activeTask && (
          <div className="rotate-1 rounded-lg border border-border bg-card p-3 shadow-xl">
            <CardBody task={activeTask} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
