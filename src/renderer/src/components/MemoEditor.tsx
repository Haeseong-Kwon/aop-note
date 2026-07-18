import { useState } from 'react'
import { Maximize2, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { BlockNoteEditor } from './BlockNoteEditor'
import { MemoExportMenu, EXPORTS } from './MemoExportMenu'
import { DocumentViewer } from './DocumentViewer'
import { useMemoPersist } from '@/hooks/useMemoPersist'
import { useStore } from '@/store/useStore'
import type { Attachment, ExportFormat, Task } from '@shared/types'

/** Inline memo shown under an expanded task row, with a fullscreen escape hatch. */
export function MemoEditor({ task }: { task: Task }): JSX.Element {
  const setMainView = useStore((s) => s.setMainView)
  const { dark, initialMarkdown, onMarkdownChange, persistNow } = useMemoPersist(task)
  const [fullscreen, setFullscreen] = useState(false)
  const [viewing, setViewing] = useState<Attachment | null>(null)

  const exportAs = async (fmt: ExportFormat): Promise<void> => {
    await persistNow()
    await window.api.memo.export(task.id, fmt)
  }

  const closeFullscreen = (): void => {
    void persistNow()
    setFullscreen(false)
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground">메모</label>
        <div className="flex items-center gap-1">
          <button
            title="메모 탭에서 열기"
            onClick={() => {
              void persistNow()
              setMainView('notes')
            }}
            className="rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            메모 탭에서 열기
          </button>
          <button
            title="전체화면"
            onClick={() => setFullscreen(true)}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
          <MemoExportMenu taskId={task.id} flush={persistNow} />
        </div>
      </div>

      {!fullscreen && (
        <BlockNoteEditor
          key={task.id}
          taskId={task.id}
          initialMarkdown={initialMarkdown}
          onMarkdownChange={onMarkdownChange}
          dark={dark}
          variant="inline"
          onOpenAttachment={setViewing}
          className="min-h-[12rem] max-h-[28rem] rounded-lg bg-muted/30 py-1"
        />
      )}

      <Dialog open={fullscreen} onOpenChange={(o) => !o && closeFullscreen()}>
        <DialogContent className="flex h-[90vh] w-[95vw] max-w-5xl flex-col gap-0 p-0" hideClose>
          <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
            <FileText className="h-4 w-4 text-primary" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{task.title}</span>
            {EXPORTS.map(({ fmt, label, icon: Icon }) => (
              <Button
                key={fmt}
                size="sm"
                variant="ghost"
                title={label}
                onClick={() => void exportAs(fmt)}
              >
                <Icon className="h-3.5 w-3.5" />
                {fmt.toUpperCase()}
              </Button>
            ))}
            <Button size="sm" variant="outline" onClick={closeFullscreen}>
              닫기
            </Button>
          </header>
          {fullscreen && (
            <BlockNoteEditor
              key={`${task.id}-fs`}
              taskId={task.id}
              initialMarkdown={initialMarkdown}
              onMarkdownChange={onMarkdownChange}
              dark={dark}
              variant="page"
              autoFocus
              onOpenAttachment={setViewing}
              className="min-h-0 flex-1"
            />
          )}
        </DialogContent>
      </Dialog>

      {viewing && (
        <DocumentViewer
          attachmentId={viewing.id}
          fileName={viewing.file_name}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  )
}
