import { useState, type ReactNode } from 'react'
import { Trash2 } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Button } from '@/components/ui/button'
import { PRIORITY_META, STATUS_META, toDateInput, fromDateInput } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Priority, Task, TaskStatus } from '@shared/types'

const STATUSES: TaskStatus[] = ['todo', 'doing', 'done']
const PRIORITIES: Priority[] = [0, 1, 2, 3]

/**
 * In-place task editor rendered inside an expanded list row / kanban card.
 * Selections commit immediately; text fields commit on blur (Notion-like).
 * Parent must mount with key={task.id} so local state re-hydrates per task.
 */
export function TaskInlineEditor({ task }: { task: Task }): JSX.Element {
  const categories = useStore((s) => s.categories)
  const goals = useStore((s) => s.goals)
  const updateTask = useStore((s) => s.updateTask)
  const deleteTask = useStore((s) => s.deleteTask)

  const [title, setTitle] = useState(task.title)
  const [note, setNote] = useState(task.note)

  const commitTitle = (): void => {
    const next = title.trim()
    if (next && next !== task.title) updateTask({ id: task.id, title: next })
    else setTitle(task.title)
  }
  const commitNote = (): void => {
    if (note !== task.note) updateTask({ id: task.id, note })
  }

  return (
    <div
      className="space-y-4 border-t border-border bg-muted/20 px-4 py-4"
      onClick={(e) => e.stopPropagation()}
    >
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={commitTitle}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-ring"
      />

      <div className="grid grid-cols-2 gap-4">
        <Field label="상태">
          <div className="flex gap-1">
            {STATUSES.map((s) => (
              <Chip key={s} active={task.status === s} onClick={() => updateTask({ id: task.id, status: s })}>
                {STATUS_META[s].label}
              </Chip>
            ))}
          </div>
        </Field>

        <Field label="우선순위">
          <div className="flex gap-1">
            {PRIORITIES.map((p) => (
              <Chip key={p} active={task.priority === p} onClick={() => updateTask({ id: task.id, priority: p })}>
                {PRIORITY_META[p].label}
              </Chip>
            ))}
          </div>
        </Field>

        <Field label="기한">
          <input
            type="date"
            value={toDateInput(task.due_date)}
            onChange={(e) => updateTask({ id: task.id, due_date: fromDateInput(e.target.value) })}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </Field>

        <Field label="카테고리">
          <select
            value={task.category_id}
            onChange={(e) => updateTask({ id: task.id, category_id: e.target.value })}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.parent_id ? '— ' : ''}
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="목표">
        <select
          value={task.goal_id ?? ''}
          onChange={(e) =>
            updateTask({ id: task.id, goal_id: e.target.value === '' ? null : e.target.value })
          }
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">연결 없음</option>
          {goals.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title}
            </option>
          ))}
        </select>
      </Field>

      <Field label="메모 (Markdown)">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={commitNote}
          rows={4}
          placeholder="세부 내용, 체크리스트, 링크 등"
          className="w-full resize-y rounded-md border border-input bg-background p-3 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-ring"
        />
      </Field>

      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={() => deleteTask(task.id)}
        >
          <Trash2 className="h-4 w-4" />
          작업 삭제
        </Button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}

function Chip({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex-1 rounded-md border px-2 py-1.5 text-xs transition-colors',
        active
          ? 'border-primary bg-primary/10 font-medium text-foreground'
          : 'border-input text-muted-foreground hover:bg-accent'
      )}
    >
      {children}
    </button>
  )
}
