import { useEffect, useRef, useState } from 'react'
import { Trash2, CalendarDays, Hash } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { BlockNoteEditor, type MemoEditorHandle } from './BlockNoteEditor'
import { MemoExportMenu } from './MemoExportMenu'
import { useMemoPersist } from '@/hooks/useMemoPersist'
import { cn } from '@/lib/utils'
import type { Category, Task, TaskStatus } from '@shared/types'

const STATUSES: { value: TaskStatus; label: string; active: string }[] = [
  { value: 'todo', label: '할 일', active: 'bg-slate-500/15 text-slate-500 dark:text-slate-300' },
  { value: 'doing', label: '진행 중', active: 'bg-blue-500/15 text-blue-600 dark:text-blue-300' },
  { value: 'done', label: '완료', active: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300' }
]

function savedLabel(iso: string): string {
  const d = new Date(iso)
  const mins = Math.round((Date.now() - d.getTime()) / 60000)
  if (mins < 1) return '방금 저장됨'
  if (mins < 60) return `${mins}분 전 저장됨`
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} 저장됨`
}

/** A single memo rendered as a full page: title, meta bar, WYSIWYG body. */
export function NotePage({ task, category }: { task: Task; category?: Category }): JSX.Element {
  const updateTask = useStore((s) => s.updateTask)
  const deleteTask = useStore((s) => s.deleteTask)
  const { dark, initialMarkdown, onMarkdownChange, persistNow } = useMemoPersist(task)
  const [title, setTitle] = useState(task.title)
  const titleRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<MemoEditorHandle>(null)

  // Keep the input in sync when the same page is edited elsewhere (list view).
  useEffect(() => setTitle(task.title), [task.title])

  const commitTitle = (): void => {
    const next = title.trim()
    if (next !== task.title) void updateTask({ id: task.id, title: next || '제목 없음' })
    if (!next) setTitle(task.title)
  }

  /** Enter / ArrowDown / ArrowRight-at-end move the caret from the title into the body. */
  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.nativeEvent.isComposing) return // 한글 IME 조합 중에는 무시
    const input = e.currentTarget
    const atEnd = input.selectionStart === title.length && input.selectionEnd === title.length
    const leaving =
      e.key === 'Enter' || e.key === 'ArrowDown' || (e.key === 'ArrowRight' && atEnd)
    if (!leaving) return
    e.preventDefault()
    commitTitle()
    bodyRef.current?.focusStart()
  }

  const remove = (): void => {
    if (window.confirm(`"${task.title || '제목 없음'}" 메모를 삭제할까요?`)) void deleteTask(task.id)
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-11 shrink-0 items-center gap-2 px-4">
        {category && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: category.color }}
            />
            {category.name}
          </span>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground">
          {savedLabel(task.updated_at)}
        </span>
        <MemoExportMenu taskId={task.id} flush={persistNow} />
        <button
          title="삭제"
          onClick={remove}
          className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </header>

      <div className="mx-auto w-full max-w-3xl shrink-0 px-14 pt-6">
        <input
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={handleTitleKeyDown}
          placeholder="제목 없음"
          className="w-full bg-transparent text-[2rem] font-bold leading-tight tracking-tight outline-none placeholder:text-muted-foreground/30"
        />

        <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Hash className="h-3.5 w-3.5" />
            {STATUSES.map((s) => (
              <button
                key={s.value}
                onClick={() => void updateTask({ id: task.id, status: s.value })}
                className={cn(
                  'rounded px-2 py-0.5 transition-colors',
                  task.status === s.value ? s.active : 'hover:bg-accent'
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
          <label className="flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 hover:bg-accent">
            <CalendarDays className="h-3.5 w-3.5" />
            <input
              type="date"
              value={task.due_date ? task.due_date.slice(0, 10) : ''}
              onChange={(e) =>
                void updateTask({ id: task.id, due_date: e.target.value || null })
              }
              className="cursor-pointer bg-transparent text-xs outline-none"
            />
          </label>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden pt-2">
        <BlockNoteEditor
          ref={bodyRef}
          taskId={task.id}
          initialMarkdown={initialMarkdown}
          onMarkdownChange={onMarkdownChange}
          dark={dark}
          variant="page"
          onLeaveTop={() => titleRef.current?.focus()}
          className="h-full"
        />
      </div>
    </div>
  )
}
