import { useState } from 'react'
import { Download, FileText, FileCode, FileType } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ExportFormat } from '@shared/types'

export const EXPORTS: { fmt: ExportFormat; label: string; icon: typeof FileText }[] = [
  { fmt: 'md', label: 'Markdown (.md)', icon: FileText },
  { fmt: 'html', label: 'HTML (.html)', icon: FileCode },
  { fmt: 'pdf', label: 'PDF (.pdf)', icon: FileType }
]

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
    try {
      await flush()
      await window.api.memo.export(taskId, fmt)
    } catch (error) {
      console.error('메모 내보내기 실패:', error)
    }
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
  )
}
