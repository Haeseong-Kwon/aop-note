import { useEffect, useState } from 'react'
import DOMPurify from 'dompurify'
import { ExternalLink, Loader2 } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { AttachmentRender } from '@shared/types'

interface DocumentViewerProps {
  attachmentId: string
  fileName: string
  onClose: () => void
}

export function DocumentViewer({ attachmentId, fileName, onClose }: DocumentViewerProps): JSX.Element {
  const [render, setRender] = useState<AttachmentRender | null>(null)
  const [sheetIndex, setSheetIndex] = useState(0)

  useEffect(() => {
    let alive = true
    setRender(null)
    setSheetIndex(0)
    window.api.attachment.render(attachmentId).then((r) => {
      if (alive) setRender(r)
    })
    return () => {
      alive = false
    }
  }, [attachmentId])

  return (
    <Dialog open onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent
        className="flex h-[85vh] w-[90vw] max-w-5xl flex-col gap-0 p-0"
        hideClose
      >
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{fileName}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.api.attachment.openExternal(attachmentId)}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            외부 앱으로 열기
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            닫기
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-hidden bg-muted/20">
          {!render ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              문서를 여는 중…
            </div>
          ) : (
            <Content render={render} sheetIndex={sheetIndex} onSheet={setSheetIndex} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Content({
  render,
  sheetIndex,
  onSheet
}: {
  render: AttachmentRender
  sheetIndex: number
  onSheet: (i: number) => void
}): JSX.Element {
  switch (render.kind) {
    case 'pdf':
      return <iframe title="pdf" src={render.url} className="h-full w-full border-0 bg-white" />
    case 'image':
      return (
        <div className="flex h-full items-center justify-center overflow-auto p-4">
          <img src={render.url} alt="" className="max-h-full max-w-full object-contain" />
        </div>
      )
    case 'html':
      return (
        <div
          className="doc-html h-full overflow-auto bg-white p-8 text-sm leading-relaxed text-zinc-900"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(render.html) }}
        />
      )
    case 'sheets': {
      const sheet = render.sheets[sheetIndex] ?? render.sheets[0]
      return (
        <div className="flex h-full flex-col">
          {render.sheets.length > 1 && (
            <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-card px-2 py-1.5">
              {render.sheets.map((s, i) => (
                <button
                  key={s.name}
                  onClick={() => onSheet(i)}
                  className={
                    'rounded px-2 py-1 text-xs transition-colors ' +
                    (i === sheetIndex
                      ? 'bg-primary/10 font-medium text-foreground'
                      : 'text-muted-foreground hover:bg-accent')
                  }
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
          <div
            className="doc-sheet min-h-0 flex-1 overflow-auto bg-white p-4 text-sm text-zinc-900"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(sheet?.html ?? '') }}
          />
        </div>
      )
    }
    case 'text':
      return (
        <pre className="h-full overflow-auto whitespace-pre-wrap break-words p-6 font-mono text-sm">
          {render.text}
        </pre>
      )
    default:
      return (
        <div className="flex h-full flex-col items-center justify-center gap-1 text-sm text-muted-foreground">
          <p>{render.reason}</p>
          <p>오른쪽 위 “외부 앱으로 열기”로 확인하세요.</p>
        </div>
      )
  }
}
