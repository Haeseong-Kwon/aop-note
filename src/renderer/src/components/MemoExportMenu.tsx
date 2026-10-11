import { useState } from 'react'
import { Download, FileText, FileCode, FileType, Presentation } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ExportFormat } from '@shared/types'
import { notePngs } from '@/lib/chartImage'
import { useStore } from '@/store/useStore'
import { toastError } from '@/store/useToast'

export const EXPORTS: { fmt: ExportFormat; label: string; icon: typeof FileText }[] = [
  { fmt: 'md', label: 'Markdown (.md)', icon: FileText },
  { fmt: 'html', label: 'HTML (.html)', icon: FileCode },
  { fmt: 'pdf', label: 'PDF (.pdf)', icon: FileType },
  { fmt: 'docx', label: 'Word (.docx)', icon: FileText },
  { fmt: 'pptx', label: 'PowerPoint (.pptx)', icon: Presentation }
]

/**
 * Export a memo after its pending edits are saved. For PowerPoint the memo's charts are
 * drawn here first (main has no DOM) and handed over as PNGs in document order.
 */
export async function exportMemoFile(taskId: string, fmt: ExportFormat, flush: () => Promise<void>): Promise<void> {
  try {
    await flush()
    const note = useStore.getState().tasks.find((t) => t.id === taskId)?.note ?? ''
    const images = fmt === 'pptx' ? await notePngs(note) : undefined
    await window.api.memo.export(taskId, fmt, images)
  } catch (error) {
    console.error('메모 내보내기 실패:', error)
    toastError(error)
  }
}

/**
 * Export dropdown for a task memo. `flush` runs first so the file on disk
 * reflects edits that are still sitting in the debounce window.
 */
export function MemoExportMenu({
  taskId,
  flush,
  className
}: {
  taskId: string
  flush: () => Promise<void>
  className?: string
}): JSX.Element {
  const [open, setOpen] = useState(false)

  const doExport = async (fmt: ExportFormat): Promise<void> => {
    setOpen(false)
    await exportMemoFile(taskId, fmt, flush)
  }

  return (
    <div className={cn('relative', className)}>
      <button
        title="내보내기"
        onClick={() => setOpen((v) => !v)}
        className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Download className="h-3.5 w-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-52 origin-top-right animate-pop-in overflow-hidden rounded-lg border border-border bg-popover py-1 shadow-lg">
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
  )
}
