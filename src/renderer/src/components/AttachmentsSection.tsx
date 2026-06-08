import { useEffect, useRef, useState } from 'react'
import {
  Paperclip,
  Upload,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  File as FileIcon,
  Eye,
  Trash2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DocumentViewer } from './DocumentViewer'
import { formatFileSize } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Attachment } from '@shared/types'

function iconFor(ext: string): typeof FileIcon {
  if (['pdf', 'doc', 'docx', 'txt', 'md', 'markdown', 'rtf'].includes(ext)) return FileText
  if (['xlsx', 'xls', 'xlsm', 'csv'].includes(ext)) return FileSpreadsheet
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return ImageIcon
  return FileIcon
}

export function AttachmentsSection({ taskId }: { taskId: string }): JSX.Element {
  const [items, setItems] = useState<Attachment[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [viewing, setViewing] = useState<Attachment | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const reload = async (): Promise<void> => {
    setItems(await window.api.attachment.listByTask(taskId))
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId])

  const addFiles = async (files: FileList | File[]): Promise<void> => {
    const arr = Array.from(files)
    if (arr.length === 0) return
    setBusy(true)
    try {
      for (const f of arr) {
        const path = window.api.getPathForFile(f)
        if (!path) continue
        await window.api.attachment.add({ task_id: taskId, source_path: path, file_name: f.name })
      }
      await reload()
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string): Promise<void> => {
    await window.api.attachment.remove(id)
    await reload()
  }

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-muted-foreground">첨부 문서</label>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          addFiles(e.dataTransfer.files)
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed py-4 text-center text-xs transition-colors',
          dragOver
            ? 'border-primary bg-primary/5 text-foreground'
            : 'border-input text-muted-foreground hover:bg-accent/40'
        )}
      >
        <Upload className="h-4 w-4" />
        <span>
          {busy ? '추가하는 중…' : '파일을 끌어다 놓거나 클릭해 선택'}
        </span>
        <span className="text-[11px] text-muted-foreground/70">PDF · Word · Excel · 이미지 · 텍스트</span>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {items.length > 0 && (
        <ul className="space-y-1">
          {items.map((a) => {
            const Icon = iconFor(a.ext)
            return (
              <li
                key={a.id}
                className="group flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5"
              >
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <button
                  onClick={() => setViewing(a)}
                  className="min-w-0 flex-1 truncate text-left text-sm hover:underline"
                  title="문서 보기"
                >
                  {a.file_name}
                </button>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {formatFileSize(a.size)}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 shrink-0"
                  onClick={() => setViewing(a)}
                  title="보기"
                >
                  <Eye className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => remove(a.id)}
                  title="삭제"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            )
          })}
        </ul>
      )}

      {items.length === 0 && (
        <p className="flex items-center gap-1 px-1 text-[11px] text-muted-foreground/70">
          <Paperclip className="h-3 w-3" /> 첨부된 문서가 없습니다.
        </p>
      )}

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
