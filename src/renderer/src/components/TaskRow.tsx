import { useState, type ReactNode } from 'react'
import { Check, ChevronRight, CalendarPlus } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { DueBadge } from './TaskBadges'
import { TaskInlineEditor } from './TaskInlineEditor'
import { PRIORITY_META, toDateInput, fromDateInput } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Priority, Task, TaskWithContext } from '@shared/types'

interface TaskRowProps {
  task: Task | TaskWithContext
  mode: 'list' | 'smart'
  /** Drag handle slot (list mode), rendered at the row's left edge. */
  handle?: ReactNode
}

const hasContext = (t: Task | TaskWithContext): t is TaskWithContext =>
  'workspace_name' in t

export function TaskRow({ task, mode, handle }: TaskRowProps): JSX.Element {
  const selected = useStore((s) => s.selectedTaskId === task.id)
  const expanded = useStore((s) => mode === 'list' && s.expandedTaskId === task.id)
  const editingTitle = useStore((s) => s.editingTitleId === task.id)
  const setSelectedTask = useStore((s) => s.setSelectedTask)
  const toggleExpand = useStore((s) => s.toggleExpand)
  const setEditingTitle = useStore((s) => s.setEditingTitle)
  const toggleDone = useStore((s) => s.toggleDone)
  const updateTask = useStore((s) => s.updateTask)
  const setPriority = useStore((s) => s.setPriority)
  const focusTask = useStore((s) => s.focusTask)

  const [editingDue, setEditingDue] = useState(false)
  const done = task.status === 'done'

  const commitTitle = (value: string): void => {
    const next = value.trim()
    if (next && next !== task.title) updateTask({ id: task.id, title: next })
    setEditingTitle(null)
  }

  const cyclePriority = (): void => {
    setPriority(task.id, (((task.priority + 1) % 4) as Priority))
  }

  const onRowClick = (): void => {
    setSelectedTask(task.id)
    if (mode === 'list') toggleExpand(task.id)
  }

  const stop = (e: React.MouseEvent): void => e.stopPropagation()

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border transition-colors',
        expanded ? 'border-border bg-card' : 'border-transparent',
        selected && !expanded && 'bg-accent/60 ring-1 ring-inset ring-primary/40'
      )}
    >
      <div
        className={cn(
          'group flex cursor-pointer items-center gap-2 px-2 py-2 transition-colors hover:bg-accent/50',
          done && 'opacity-55'
        )}
        onClick={onRowClick}
      >
        {handle}

        <button
          onClick={(e) => {
            stop(e)
            toggleDone(task)
          }}
          className={cn(
            'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors',
            done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-input hover:border-primary'
          )}
          title={done ? '완료 취소' : '완료'}
        >
          {done && <Check className="h-3.5 w-3.5" />}
        </button>

        {mode === 'smart' && hasContext(task) && (
          <span
            className="flex shrink-0 items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
            title={`${task.workspace_name} · ${task.category_name}`}
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: task.workspace_color }} />
            <span className="max-w-[120px] truncate">
              {task.workspace_name} / {task.category_name}
            </span>
          </span>
        )}

        {editingTitle ? (
          <input
            autoFocus
            defaultValue={task.title}
            onClick={stop}
            onBlur={(e) => commitTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return // 한글 IME 조합 Enter 무시
              if (e.key === 'Enter') commitTitle((e.target as HTMLInputElement).value)
              if (e.key === 'Escape') setEditingTitle(null)
            }}
            className="h-7 min-w-0 flex-1 rounded border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        ) : (
          <button
            className={cn('min-w-0 flex-1 truncate text-left text-sm', done && 'line-through')}
            onClick={(e) => {
              if (mode === 'smart') {
                stop(e)
                focusTask(task)
              }
            }}
            onDoubleClick={(e) => {
              stop(e)
              setSelectedTask(task.id)
              setEditingTitle(task.id)
            }}
            title={mode === 'smart' ? '클릭하여 작업으로 이동 (더블클릭: 제목 편집)' : '더블클릭: 제목 편집'}
          >
            {task.title}
          </button>
        )}

        <div className="flex shrink-0 items-center gap-1.5" onClick={stop}>
          <button
            onClick={cyclePriority}
            title="우선순위 (클릭하여 변경 / 숫자키 0–3)"
            className={cn(
              'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors',
              PRIORITY_META[task.priority].className
            )}
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', PRIORITY_META[task.priority].dot)} />
            {PRIORITY_META[task.priority].label}
          </button>

          {editingDue ? (
            <input
              type="date"
              autoFocus
              defaultValue={toDateInput(task.due_date)}
              onChange={(e) => {
                updateTask({ id: task.id, due_date: fromDateInput(e.target.value) })
                setEditingDue(false)
              }}
              onBlur={() => setEditingDue(false)}
              className="h-7 rounded border border-input bg-background px-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
            />
          ) : task.due_date ? (
            <button onClick={() => setEditingDue(true)} title="기한 변경">
              <DueBadge due={task.due_date} />
            </button>
          ) : (
            <button
              onClick={() => setEditingDue(true)}
              title="기한 추가"
              className="rounded p-0.5 text-muted-foreground/50 opacity-0 transition hover:text-foreground group-hover:opacity-100"
            >
              <CalendarPlus className="h-3.5 w-3.5" />
            </button>
          )}

          {mode === 'list' && (
            <ChevronRight
              className={cn(
                'h-4 w-4 text-muted-foreground transition-transform',
                expanded && 'rotate-90'
              )}
            />
          )}
        </div>
      </div>

      {expanded && <TaskInlineEditor task={task} />}
    </div>
  )
}
