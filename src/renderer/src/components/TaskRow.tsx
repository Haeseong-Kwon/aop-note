import { useState, type ReactNode } from 'react'
import { Bell, ChevronRight, CalendarPlus, StickyNote, Repeat, ListChecks } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { DueBadge, PriorityGlyph, TaskCheck } from './TaskBadges'
import { MarkdownView } from './MarkdownView'
import { TaskInlineEditor } from './TaskInlineEditor'
import {
  PRIORITY_META,
  RECURRENCE_LABEL,
  checklistProgress,
  formatReminder,
  toDateInput,
  fromDateInput
} from '@/lib/format'
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
  const [memoOpen, setMemoOpen] = useState(false)
  const done = task.status === 'done'
  const hasMemo = Boolean(task.note && task.note.trim())
  const checklist = checklistProgress(task.note ?? '')

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
        'overflow-hidden rounded-lg border transition-colors duration-base',
        expanded ? 'border-border bg-card shadow-sm' : 'border-transparent',
        selected && !expanded && 'bg-desk/[0.07] ring-1 ring-inset ring-desk/30'
      )}
    >
      <div
        className={cn(
          'group flex cursor-pointer items-center gap-2.5 px-2.5 py-[7px] transition-[background-color,opacity] duration-base hover:bg-accent/50',
          done && 'opacity-50'
        )}
        onClick={onRowClick}
      >
        {handle}

        <TaskCheck done={done} onToggle={() => void toggleDone(task)} label={`'${task.title}' 완료`} />

        {mode === 'smart' && hasContext(task) && (
          <span
            className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground"
            title={`${task.workspace_name} · ${task.category_name}`}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: task.workspace_color }} />
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
            className={cn(
              'min-w-0 flex-1 truncate text-left text-sm decoration-muted-foreground/60 transition-colors duration-base',
              done && 'text-muted-foreground line-through'
            )}
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
          {task.remind_at && !done && (
            <span
              title={`알림: ${formatReminder(task.remind_at)}`}
              className="inline-flex items-center gap-1 text-[11px] tabular-nums text-muted-foreground"
            >
              <Bell className="h-3.5 w-3.5" />
              {formatReminder(task.remind_at).split(' ')[1]}
            </span>
          )}
          {task.recurrence && (
            <span title={`반복: ${RECURRENCE_LABEL[task.recurrence]}`} className="text-muted-foreground">
              <Repeat className="h-3.5 w-3.5" />
            </span>
          )}
          {checklist && (
            <span
              title="메모 체크리스트 진행률"
              className={cn(
                'inline-flex items-center gap-1 text-[11px] tabular-nums',
                checklist.done === checklist.total ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
              )}
            >
              <ListChecks className="h-3.5 w-3.5" />
              {checklist.done}/{checklist.total}
            </span>
          )}
          {hasMemo && (
            <button
              onClick={() => setMemoOpen((v) => !v)}
              title={memoOpen ? '메모 접기' : '메모 펼치기'}
              className={cn(
                'rounded p-0.5 transition-colors',
                memoOpen ? 'text-primary' : 'text-muted-foreground/60 hover:text-foreground'
              )}
            >
              <StickyNote className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={cyclePriority}
            title={`우선순위: ${PRIORITY_META[task.priority].label} (클릭하여 변경 / 숫자키 0–3)`}
            aria-label={`우선순위 ${PRIORITY_META[task.priority].label}, 바꾸기`}
            className={cn(
              'inline-flex h-6 w-6 items-center justify-center rounded-md transition-[background-color,opacity] duration-base hover:bg-accent',
              // Like an empty Notion property: hidden until the row is hovered or selected.
              task.priority === 0 && !selected && 'opacity-0 focus-visible:opacity-100 group-hover:opacity-100 group-has-[:focus-visible]:opacity-100'
            )}
          >
            <PriorityGlyph priority={task.priority} />
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
              className="rounded p-0.5 text-muted-foreground/50 opacity-0 transition hover:text-foreground group-hover:opacity-100 group-has-[:focus-visible]:opacity-100"
            >
              <CalendarPlus className="h-3.5 w-3.5" />
            </button>
          )}

          {mode === 'list' && (
            <ChevronRight
              className={cn(
                'h-4 w-4 text-muted-foreground/70 transition-[transform,opacity] duration-base ease-out',
                expanded ? 'rotate-90 opacity-100' : 'opacity-0 group-hover:opacity-100 group-has-[:focus-visible]:opacity-100'
              )}
            />
          )}
        </div>
      </div>

      {memoOpen && hasMemo && !expanded && (
        <div className="border-t border-border bg-muted/20 px-4 py-3" onClick={stop}>
          <MarkdownView source={task.note} />
        </div>
      )}

      {expanded && <TaskInlineEditor task={task} />}
    </div>
  )
}
