import { useEffect, useRef, useState } from 'react'
import { Trash2, CalendarDays, Hash, Smile, ImagePlus } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { BlockNoteEditor, type MemoEditorHandle } from './BlockNoteEditor'
import { MemoExportMenu } from './MemoExportMenu'
import { DocumentViewer } from './DocumentViewer'
import { Backlinks } from './Backlinks'
import { NoteCover, CoverPicker } from './memo/NoteCover'
import { NotePageMenu, PageIconPicker } from './memo/NotePageMenu'
import { useMemoPersist } from '@/hooks/useMemoPersist'
import { toDateInput, fromDateInput } from '@/lib/format'
import { cn } from '@/lib/utils'
import { parsePageMeta, type PageMeta } from '@shared/pageMeta'
import type { Attachment, Category, Task, TaskStatus } from '@shared/types'

const STATUSES: { value: TaskStatus; label: string; active: string }[] = [
  { value: 'todo', label: '할 일', active: 'bg-slate-500/15 text-slate-500 dark:text-slate-300' },
  { value: 'doing', label: '진행 중', active: 'bg-blue-500/15 text-blue-600 dark:text-blue-300' },
  { value: 'done', label: '완료', active: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300' }
]

const FONT_CLASS: Record<string, string> = { serif: 'font-note-serif', mono: 'font-note-mono' }

function savedLabel(iso: string): string {
  const d = new Date(iso)
  const mins = Math.round((Date.now() - d.getTime()) / 60000)
  if (mins < 1) return '방금 저장됨'
  if (mins < 60) return `${mins}분 전 저장됨`
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} 저장됨`
}

/** A memo as a Notion-style page: cover, icon, title, properties, blocks, backlinks — one scroll. */
export function NotePage({ task, category }: { task: Task; category?: Category }): JSX.Element {
  const updateTask = useStore((s) => s.updateTask)
  const deleteTask = useStore((s) => s.deleteTask)
  const duplicateNote = useStore((s) => s.duplicateNote)
  const { dark, initialMarkdown, initialDoc, onMarkdownChange, persistNow, revision } = useMemoPersist(task)
  const [title, setTitle] = useState(task.title)
  const titleRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<MemoEditorHandle>(null)
  const iconRef = useRef<HTMLButtonElement>(null)
  const addCoverRef = useRef<HTMLButtonElement>(null)
  const [viewing, setViewing] = useState<Attachment | null>(null)
  const [picker, setPicker] = useState<'icon' | 'cover' | null>(null)

  const meta = parsePageMeta(task.page_meta)
  // Absent keys drop out of the JSON, so `undefined` clears a setting.
  const setMeta = (patch: Partial<PageMeta>): void =>
    void updateTask({ id: task.id, page_meta: JSON.stringify({ ...meta, ...patch }) })

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
    const leaving = e.key === 'Enter' || e.key === 'ArrowDown' || (e.key === 'ArrowRight' && atEnd)
    if (!leaving) return
    e.preventDefault()
    commitTitle()
    bodyRef.current?.focusStart()
  }

  // No confirm: the delete toast offers undo and the trash keeps it.
  const remove = (): void => void deleteTask(task.id)
  const fontClass = meta.font ? FONT_CLASS[meta.font] : undefined
  const column = meta.fullWidth ? 'max-w-none px-24' : 'max-w-3xl px-14'

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-11 shrink-0 items-center gap-2 px-4">
        {category && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: category.color }} />
            {category.name}
          </span>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground">{savedLabel(task.updated_at)}</span>
        <MemoExportMenu taskId={task.id} flush={persistNow} />
        <NotePageMenu
          meta={meta}
          onChange={setMeta}
          onDuplicate={async () => {
            await persistNow()
            await duplicateNote(task)
          }}
          onSummarize={() => bodyRef.current?.aiOnPage('summarize')}
        />
        <button
          title="삭제"
          onClick={remove}
          className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <NoteCover taskId={task.id} meta={meta} onChange={setMeta} />

        <div className={cn('group/title mx-auto w-full', column, meta.cover ? 'pt-0' : 'pt-10', fontClass)}>
          {meta.icon && (
            <button
              ref={iconRef}
              onClick={() => setPicker('icon')}
              title="아이콘 변경"
              className={cn(
                'relative block rounded-lg text-[4.5rem] leading-none transition-colors hover:bg-accent/50',
                meta.cover ? '-mt-10' : 'mb-1'
              )}
            >
              {meta.icon}
            </button>
          )}

          {(!meta.icon || !meta.cover) && (
            <div className={cn('flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover/title:opacity-100', meta.icon || meta.cover ? 'mt-2' : '')}>
              {!meta.icon && (
                <button
                  ref={iconRef}
                  onClick={() => setPicker('icon')}
                  className="flex items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Smile className="h-3.5 w-3.5" />
                  아이콘 추가
                </button>
              )}
              {!meta.cover && (
                <button
                  ref={addCoverRef}
                  onClick={() => setPicker('cover')}
                  className="flex items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <ImagePlus className="h-3.5 w-3.5" />
                  표지 추가
                </button>
              )}
            </div>
          )}

          <input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={handleTitleKeyDown}
            placeholder="제목 없음"
            className="mt-1 w-full bg-transparent text-[2.5rem] font-bold leading-tight tracking-tight outline-none placeholder:text-muted-foreground/30"
          />

          <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Hash className="h-3.5 w-3.5" />
              {STATUSES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => void updateTask({ id: task.id, status: s.value })}
                  className={cn('rounded px-2 py-0.5 transition-colors', task.status === s.value ? s.active : 'hover:bg-accent')}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <label className="flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 hover:bg-accent">
              <CalendarDays className="h-3.5 w-3.5" />
              <input
                type="date"
                value={toDateInput(task.due_date)}
                onChange={(e) => void updateTask({ id: task.id, due_date: fromDateInput(e.target.value) })}
                className="cursor-pointer bg-transparent text-xs outline-none"
              />
            </label>
          </div>
        </div>

        <BlockNoteEditor
          key={revision}
          ref={bodyRef}
          taskId={task.id}
          initialMarkdown={initialMarkdown}
          initialDoc={initialDoc}
          onMarkdownChange={onMarkdownChange}
          dark={dark}
          variant="page"
          onLeaveTop={() => titleRef.current?.focus()}
          onOpenAttachment={setViewing}
          footer={<Backlinks taskId={task.id} className={cn('mx-auto mb-12', column)} />}
          className={cn('pt-2', meta.fullWidth && 'bn-memo--full', fontClass)}
        />
      </div>

      {picker === 'icon' && (
        <PageIconPicker
          anchorEl={iconRef.current}
          current={meta.icon}
          onPick={(icon) => setMeta({ icon })}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === 'cover' && (
        <CoverPicker taskId={task.id} anchorEl={addCoverRef.current} onPick={setMeta} onClose={() => setPicker(null)} />
      )}

      {viewing && <DocumentViewer attachmentId={viewing.id} fileName={viewing.file_name} onClose={() => setViewing(null)} />}
    </div>
  )
}
