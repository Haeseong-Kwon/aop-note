import { useMemo, useState } from 'react'
import { Check, Plus, Repeat } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { formatDue, formatRelative, PRIORITY_META, sortTasks } from '@/lib/format'
import { memoPreview } from '@/components/NotesView'
import { flattenTree } from '@shared/tree'
import { cn } from '@/lib/utils'
import { useNav } from './nav'
import type { Task, TaskWithContext } from '@shared/types'

const DUE_TONE = {
  overdue: 'text-destructive',
  soon: 'text-amber-600 dark:text-amber-400',
  normal: 'text-muted-foreground'
} as const

/** A task as a phone row: round checkbox, title, due/priority line. Tap opens its page. */
export function MobileTaskRow({ task, depth = 0, context }: { task: Task | TaskWithContext; depth?: number; context?: string }): JSX.Element {
  const toggleDone = useStore((s) => s.toggleDone)
  const push = useNav((s) => s.push)
  const done = task.status === 'done'
  const due = formatDue(task.due_date)
  const workspaceId = 'workspace_id' in task ? task.workspace_id : useStore.getState().activeWorkspaceId

  return (
    <div className="flex min-h-[52px] items-start active:bg-accent/70" style={{ paddingLeft: 8 + depth * 22 }}>
      <button
        onClick={() => void toggleDone(task)}
        aria-label={done ? '완료 취소' : '완료로 표시'}
        aria-pressed={done}
        className="flex h-[52px] w-11 shrink-0 items-center justify-center"
      >
        <span
          className={cn(
            'flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 transition-colors',
            done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-muted-foreground/40'
          )}
        >
          {done && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
        </span>
      </button>
      <button onClick={() => push({ name: 'memo', id: task.id, workspaceId })} className="min-w-0 flex-1 py-3 pr-4 text-left">
        <span className={cn('block text-[16px] leading-snug', done && 'text-muted-foreground line-through')}>{task.title || '제목 없음'}</span>
        {(due || task.priority > 0 || context || task.recurrence) && (
          <span className="mt-1 flex items-center gap-2 text-[13px]">
            {task.priority > 0 && <span className={cn('h-2 w-2 rounded-full', PRIORITY_META[task.priority].dot)} aria-label={`우선순위 ${PRIORITY_META[task.priority].label}`} />}
            {due && <span className={DUE_TONE[due.tone]}>{due.label}</span>}
            {task.recurrence && <Repeat className="h-3 w-3 text-muted-foreground" aria-label="반복" />}
            {context && <span className="truncate text-muted-foreground">{context}</span>}
          </span>
        )}
      </button>
    </div>
  )
}

function AddRow({ placeholder, onAdd }: { placeholder: string; onAdd: (title: string) => Promise<void> }): JSX.Element {
  const [title, setTitle] = useState('')
  return (
    <form
      className="flex items-center border-b border-border/60 pl-2"
      onSubmit={(e) => {
        e.preventDefault()
        const t = title.trim()
        if (!t) return
        setTitle('')
        void onAdd(t)
      }}
    >
      <span className="flex h-12 w-11 shrink-0 items-center justify-center text-muted-foreground">
        <Plus className="h-5 w-5" />
      </span>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={placeholder}
        enterKeyHint="done"
        className="h-12 min-w-0 flex-1 bg-transparent pr-4 text-[16px] outline-none placeholder:text-muted-foreground"
      />
    </form>
  )
}

/** Tasks of the active category, sub-tasks indented under their parent. */
export function TaskList(): JSX.Element {
  const tasks = useStore((s) => s.tasks)
  const activeCategoryId = useStore((s) => s.activeCategoryId)
  const listPrefs = useStore((s) => s.listPrefs)
  const createTask = useStore((s) => s.createTask)

  const rows = useMemo(() => {
    const inCategory = tasks.filter((t) => t.category_id === activeCategoryId)
    const shown = listPrefs.hideDone ? inCategory.filter((t) => t.status !== 'done') : inCategory
    return flattenTree(sortTasks(shown, listPrefs.sort))
  }, [tasks, activeCategoryId, listPrefs])

  return (
    <div className="h-full overflow-y-auto pb-24">
      {activeCategoryId && (
        <AddRow
          placeholder="작업 추가"
          onAdd={async (title) => {
            await createTask({ category_id: activeCategoryId, title })
          }}
        />
      )}
      {rows.map(({ item, depth }) => (
        <MobileTaskRow key={item.id} task={item} depth={depth} />
      ))}
      {rows.length === 0 && <p className="px-6 py-10 text-center text-[15px] text-muted-foreground">작업이 없습니다. 위에서 바로 추가하세요.</p>}
    </div>
  )
}

/** Memos of the active category as pages: title and first line. */
export function NoteList(): JSX.Element {
  const tasks = useStore((s) => s.tasks)
  const activeCategoryId = useStore((s) => s.activeCategoryId)
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId)
  const createTask = useStore((s) => s.createTask)
  const push = useNav((s) => s.push)

  const rows = useMemo(() => flattenTree(tasks.filter((t) => t.category_id === activeCategoryId)), [tasks, activeCategoryId])

  const newNote = async (): Promise<void> => {
    if (!activeCategoryId) return
    const task = await createTask({ category_id: activeCategoryId, title: '제목 없음' })
    if (task) push({ name: 'memo', id: task.id, workspaceId: activeWorkspaceId })
  }

  return (
    <div className="h-full overflow-y-auto pb-24">
      <button onClick={() => void newNote()} className="flex h-12 w-full items-center gap-3 border-b border-border/60 pl-5 text-[16px] text-muted-foreground active:bg-accent">
        <Plus className="h-5 w-5" />
        새 메모
      </button>
      {rows.map(({ item, depth }) => (
        <button
          key={item.id}
          onClick={() => push({ name: 'memo', id: item.id, workspaceId: activeWorkspaceId })}
          className="block w-full py-3 pr-4 text-left active:bg-accent/70"
          style={{ paddingLeft: 20 + depth * 20 }}
        >
          <span className={cn('block truncate text-[16px] font-medium', item.status === 'done' && 'text-muted-foreground line-through')}>
            {item.title || '제목 없음'}
          </span>
          <span className="mt-0.5 block truncate text-[14px] text-muted-foreground">
            {memoPreview(item.note) ?? `${formatRelative(item.updated_at)} 수정`}
          </span>
        </button>
      ))}
      {rows.length === 0 && <p className="px-6 py-10 text-center text-[15px] text-muted-foreground">메모가 없습니다.</p>}
    </div>
  )
}
