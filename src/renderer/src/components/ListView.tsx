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
import { GripVertical } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { TaskRow } from './TaskRow'
import { useTaskListKeyboard } from '@/hooks/useTaskListKeyboard'
import type { Task, UpdateTaskInput } from '@shared/types'

function SortableTaskRow({ task, reorderable }: { task: Task; reorderable: boolean }): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: !reorderable
  })

  // A sorted list's order comes from the data, so dragging would be meaningless.
  const handle = reorderable && (
    <button
      {...attributes}
      {...listeners}
      onClick={(e) => e.stopPropagation()}
      title="드래그하여 순서 변경"
      className="no-drag cursor-grab touch-none text-muted-foreground/30 opacity-0 transition hover:text-foreground group-hover:opacity-100 active:cursor-grabbing"
    >
      <GripVertical className="h-4 w-4" />
    </button>
  )

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? 'relative z-10 opacity-80' : ''}
    >
      <TaskRow task={task} mode="list" handle={handle || undefined} />
    </li>
  )
}

interface ListViewProps {
  tasks: Task[]
  /** False while sorted by due/priority: drag handles are hidden. */
  reorderable?: boolean
  /** Completed tasks filtered out by "hide completed" (for the empty state). */
  hiddenDone?: number
}

export function ListView({ tasks, reorderable = true, hiddenDone = 0 }: ListViewProps): JSX.Element {
  const reorderTasks = useStore((s) => s.reorderTasks)
  const toggleExpand = useStore((s) => s.toggleExpand)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  useTaskListKeyboard(tasks, (t) => toggleExpand(t.id))

  if (tasks.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 text-sm text-muted-foreground">
        <p>{hiddenDone > 0 ? `완료된 작업 ${hiddenDone}개만 있고 숨겨져 있습니다.` : '작업이 없습니다.'}</p>
        <p>
          <kbd className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">⌘/Ctrl + N</kbd>
          으로 빠르게 추가하세요.
        </p>
      </div>
    )
  }

  const onDragEnd = (e: DragEndEvent): void => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = tasks.findIndex((t) => t.id === active.id)
    const to = tasks.findIndex((t) => t.id === over.id)
    if (from < 0 || to < 0) return
    const reordered = arrayMove(tasks, from, to)
    const updates: UpdateTaskInput[] = reordered.map((t, i) => ({ id: t.id, sort_order: i }))
    reorderTasks(updates)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <ul className="h-full space-y-1 overflow-y-auto p-3">
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <SortableTaskRow key={task.id} task={task} reorderable={reorderable} />
          ))}
        </SortableContext>
      </ul>
    </DndContext>
  )
}
