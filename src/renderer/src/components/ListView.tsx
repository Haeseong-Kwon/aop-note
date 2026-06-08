import { Check, ChevronRight } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { PriorityBadge, DueBadge } from './TaskBadges'
import { TaskInlineEditor } from './TaskInlineEditor'
import { cn } from '@/lib/utils'
import type { Task } from '@shared/types'

export function ListView({ tasks }: { tasks: Task[] }): JSX.Element {
  const toggleDone = useStore((s) => s.toggleDone)
  const toggleExpand = useStore((s) => s.toggleExpand)
  const expandedTaskId = useStore((s) => s.expandedTaskId)

  if (tasks.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 text-sm text-muted-foreground">
        <p>작업이 없습니다.</p>
        <p>
          <kbd className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">⌘/Ctrl + N</kbd>
          으로 빠르게 추가하세요.
        </p>
      </div>
    )
  }

  return (
    <ul className="h-full overflow-y-auto p-3">
      {tasks.map((task) => {
        const done = task.status === 'done'
        const expanded = expandedTaskId === task.id
        return (
          <li
            key={task.id}
            className={cn(
              'mb-1.5 overflow-hidden rounded-lg border transition-colors',
              expanded ? 'border-border bg-card' : 'border-transparent'
            )}
          >
            <div
              className={cn(
                'group flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-accent/50',
                done && 'opacity-55'
              )}
              onClick={() => toggleExpand(task.id)}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  toggleDone(task)
                }}
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors',
                  done
                    ? 'border-emerald-500 bg-emerald-500 text-white'
                    : 'border-input hover:border-primary'
                )}
                title={done ? '완료 취소' : '완료'}
              >
                {done && <Check className="h-3.5 w-3.5" />}
              </button>

              <span className={cn('min-w-0 flex-1 truncate text-sm', done && 'line-through')}>
                {task.title}
              </span>

              <div className="flex shrink-0 items-center gap-1.5">
                <PriorityBadge priority={task.priority} />
                <DueBadge due={task.due_date} />
                <ChevronRight
                  className={cn(
                    'h-4 w-4 text-muted-foreground transition-transform',
                    expanded && 'rotate-90'
                  )}
                />
              </div>
            </div>

            {expanded && <TaskInlineEditor task={task} />}
          </li>
        )
      })}
    </ul>
  )
}
