import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Pencil, Eye, Maximize2, Download, FileText, FileCode, FileType } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { EditorPane } from './EditorPane'
import { MarkdownView } from './MarkdownView'
import { cn } from '@/lib/utils'
import type { ExportFormat, Task } from '@shared/types'

const EXPORTS: { fmt: ExportFormat; label: string; icon: typeof FileText }[] = [
  { fmt: 'md', label: 'Markdown (.md)', icon: FileText },
  { fmt: 'html', label: 'HTML (.html)', icon: FileCode },
  { fmt: 'pdf', label: 'PDF (.pdf)', icon: FileType }
]

export function MemoEditor({ task }: { task: Task }): JSX.Element {
  const updateTask = useStore((s) => s.updateTask)

  const [note, setNote] = useState(task.note)
  const [mode, setMode] = useState<'edit' | 'preview'>(task.note.trim() ? 'preview' : 'edit')
  const [fullscreen, setFullscreen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const noteRef = useRef(note)
  noteRef.current = note

  const persist = (value: string): void => {
    if (value !== task.note) updateTask({ id: task.id, note: value })
  }
  const save = (): void => persist(noteRef.current)

  // Persist any unsaved edits when the editor unmounts (row collapsed, etc.).
  useEffect(() => {
    return () => persist(noteRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id])

  const toggleTask = (line: number, checked: boolean): void => {
    const lines = note.split('\n')
    const i = line - 1
    if (i < 0 || i >= lines.length) return
    lines[i] = lines[i].replace(/\[( |x|X)\]/, checked ? '[x]' : '[ ]')
    const next = lines.join('\n')
    setNote(next)
    persist(next)
  }

  const doExport = async (fmt: ExportFormat): Promise<void> => {
    setExportOpen(false)
    save() // ensure file reflects latest edits
    await window.api.memo.export(task.id, fmt)
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground">메모 (Markdown)</label>
        <div className="flex items-center gap-1">
          <Segmented mode={mode} onChange={setMode} />
          <IconBtn title="전체화면" onClick={() => setFullscreen(true)}>
            <Maximize2 className="h-3.5 w-3.5" />
          </IconBtn>
          <div className="relative">
            <IconBtn title="내보내기" onClick={() => setExportOpen((v) => !v)}>
              <Download className="h-3.5 w-3.5" />
            </IconBtn>
            {exportOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setExportOpen(false)} />
                <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-md border border-border bg-popover py-1 shadow-lg">
                  {EXPORTS.map(({ fmt, label, icon: Icon }) => (
                    <button
                      key={fmt}
                      onClick={() => doExport(fmt)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent"
                    >
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      {label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {mode === 'edit' ? (
        <EditorPane value={note} onChange={setNote} onBlur={save} className="h-80" />
      ) : (
        <div
          className="max-h-96 min-h-[5rem] overflow-y-auto rounded-md border border-input bg-background p-3"
          onClick={() => undefined}
        >
          <MarkdownView source={note} onToggleTask={toggleTask} />
        </div>
      )}

      <Dialog
        open={fullscreen}
        onOpenChange={(o) => {
          if (!o) {
            save()
            setFullscreen(false)
          }
        }}
      >
        <DialogContent className="flex h-[90vh] w-[95vw] max-w-6xl flex-col gap-0 p-0" hideClose>
          <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
            <FileText className="h-4 w-4 text-primary" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{task.title}</span>
            {EXPORTS.map(({ fmt, label, icon: Icon }) => (
              <Button key={fmt} size="sm" variant="ghost" title={label} onClick={() => doExport(fmt)}>
                <Icon className="h-3.5 w-3.5" />
                {fmt.toUpperCase()}
              </Button>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                save()
                setFullscreen(false)
              }}
            >
              닫기
            </Button>
          </header>
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-2">
            <EditorPane value={note} onChange={setNote} onBlur={save} autoFocus className="min-h-0" />
            <div className="min-h-0 overflow-y-auto rounded-md border border-border bg-background p-5">
              <MarkdownView source={note} onToggleTask={toggleTask} />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Segmented({
  mode,
  onChange
}: {
  mode: 'edit' | 'preview'
  onChange: (m: 'edit' | 'preview') => void
}): JSX.Element {
  return (
    <div className="flex items-center rounded-md bg-muted p-0.5">
      <button
        onClick={() => onChange('edit')}
        className={cn(
          'flex items-center gap-1 rounded px-2 py-0.5 text-xs transition-colors',
          mode === 'edit' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
        )}
      >
        <Pencil className="h-3 w-3" />편집
      </button>
      <button
        onClick={() => onChange('preview')}
        className={cn(
          'flex items-center gap-1 rounded px-2 py-0.5 text-xs transition-colors',
          mode === 'preview' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
        )}
      >
        <Eye className="h-3 w-3" />미리보기
      </button>
    </div>
  )
}

function IconBtn({
  title,
  onClick,
  children
}: {
  title: string
  onClick: () => void
  children: ReactNode
}): JSX.Element {
  return (
    <button
      title={title}
      onClick={onClick}
      className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  )
}
