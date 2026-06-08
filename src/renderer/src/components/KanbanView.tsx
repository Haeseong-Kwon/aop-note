import { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent
} from '@dnd-kit/core'
import { useStore } from '@/store/useStore'
import { PriorityBadge, DueBadge } from './TaskBadges'
import { TaskInlineEditor } from './TaskInlineEditor'
import { STATUS_META } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Task, TaskStatus } from '@shared/types'

const COLUMNS: TaskStatus[] = ['todo', 'doing', 'done']

function KanbanCard({ task, overlay = false }: { task: Task; overlay?: boolean }): JSX.Element {
  const toggleExpand = useStore((s) => s.toggleExpand)
  const expanded = useStore((s) => s.expandedTaskId === task.id)
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    disabled: expanded // let inputs receive clicks while editing
  })

  // While expanded the card must not be draggable, so drag props are omitted.
  const dragProps = expanded || overlay ? {} : { ...listeners, ...attributes }

  return (
    <div
      ref={setNodeRef}
      {...dragProps}
      className={cn(
        'no-drag rounded-lg border border-border bg-card shadow-sm transition-shadow',
        !expanded && 'cursor-grab active:cursor-grabbing hover:border-primary/40',
        isDragging && !overlay && 'opacity-30',
        overlay && 'rotate-1 shadow-xl'
      )}
    >
      <div className="p-3" onClick={() => !overlay && toggleExpand(task.id)}>
        <p className={cn('mb-2 text-sm', task.status === 'done' && 'line-through opacity-70')}>
          {task.title}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <PriorityBadge priority={task.priority} />
          <DueBadge due={task.due_date} />
        </div>
      </div>
      {expanded && !overlay && <TaskInlineEditor task={task} />}
    </div>
  )
}

function Column({ status, tasks }: { status: TaskStatus; tasks: Task[] }): JSX.Element {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const meta = STATUS_META[status]

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="mb-2 flex items-center gap-2 px-1">
        <h3 className={cn('text-sm font-semibold', meta.className)}>{meta.label}</h3>
        <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">
          {tasks.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'flex flex-1 flex-col gap-2 overflow-y-auto rounded-xl border border-dashed border-transparent p-2 transition-colors',
          isOver ? 'border-primary/50 bg-accent/40' : 'bg-muted/20'
        )}
      >
        {tasks.map((task) => (
          <KanbanCard key={task.id} task={task} />
        ))}
        {tasks.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">비어 있음</p>
        )}
      </div>
    </div>
  )
}

export function KanbanView({ tasks }: { tasks: Task[] }): JSX.Element {
  const moveTask = useStore((s) => s.moveTask)
  const [activeId, setActiveId] = useState<string | null>(null)

  // Small drag threshold so card clicks (expand) aren't hijacked.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const byStatus = (status: TaskStatus): Task[] =>
    tasks
      .filter((t) => t.status === status)
      .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) ?? null : null

  const onDragStart = (e: DragStartEvent): void => setActiveId(String(e.active.id))

  const onDragEnd = (e: DragEndEvent): void => {
    setActiveId(null)
    const { active, over } = e
    if (!over) return
    const targetStatus = over.id as TaskStatus
    const task = tasks.find((t) => t.id === active.id)
    if (!task || task.status === targetStatus) return
    const nextOrder = byStatus(targetStatus).length
    moveTask(task.id, targetStatus, nextOrder)
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex h-full gap-3 overflow-x-auto p-4">
        {COLUMNS.map((status) => (
          <Column key={status} status={status} tasks={byStatus(status)} />
        ))}
      </div>
      <DragOverlay>{activeTask && <KanbanCard task={activeTask} overlay />}</DragOverlay>
    </DndContext>
  )
}
