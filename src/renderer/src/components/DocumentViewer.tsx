import { useEffect, useState, type ReactNode } from 'react'
import DOMPurify from 'dompurify'
import { ExternalLink, Loader2, X, ZoomIn, ZoomOut, Maximize, FileText } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { AttachmentRender } from '@shared/types'

interface DocumentViewerProps {
  attachmentId: string
  fileName: string
  onClose: () => void
}

export function DocumentViewer({ attachmentId, fileName, onClose }: DocumentViewerProps): JSX.Element {
  const [render, setRender] = useState<AttachmentRender | null>(null)
  const [sheetIndex, setSheetIndex] = useState(0)
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    let alive = true
    setRender(null)
    setSheetIndex(0)
    setZoom(1)
    window.api.attachment.render(attachmentId).then((r) => {
      if (alive) setRender(r)
    })
    return () => {
      alive = false
    }
  }, [attachmentId])

  const isImage = render?.kind === 'image'

  return (
    <Dialog open onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent
        className="flex h-[88vh] w-[92vw] max-w-5xl flex-col gap-0 overflow-hidden rounded-xl p-0"
        hideClose
      >
        {/* Toolbar — translucent, Preview-style */}
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-card/80 px-3 backdrop-blur">
          <FileText className="ml-1 h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium" title={fileName}>
            {fileName}
          </span>

          {isImage && (
            <div className="flex items-center gap-0.5 rounded-md border border-border bg-background/60 px-0.5">
              <ToolButton title="축소" onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}>
                <ZoomOut className="h-4 w-4" />
              </ToolButton>
              <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">
                {Math.round(zoom * 100)}%
              </span>
              <ToolButton title="확대" onClick={() => setZoom((z) => Math.min(5, z + 0.25))}>
                <ZoomIn className="h-4 w-4" />
              </ToolButton>
              <ToolButton title="맞춤" onClick={() => setZoom(1)}>
                <Maximize className="h-4 w-4" />
              </ToolButton>
            </div>
          )}

          <ToolButton title="외부 앱으로 열기" onClick={() => window.api.attachment.openExternal(attachmentId)}>
            <ExternalLink className="h-4 w-4" />
          </ToolButton>
          <ToolButton title="닫기" onClick={onClose}>
            <X className="h-4 w-4" />
          </ToolButton>
        </header>

        {/* Canvas */}
        {!render ? (
          <div className="flex flex-1 items-center justify-center bg-muted/50 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            문서를 여는 중…
          </div>
        ) : (
          <Body render={render} sheetIndex={sheetIndex} onSheet={setSheetIndex} zoom={zoom} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function Body({
  render,
  sheetIndex,
  onSheet,
  zoom
}: {
  render: AttachmentRender
  sheetIndex: number
  onSheet: (i: number) => void
  zoom: number
}): JSX.Element {
  // PDF: full-bleed (Chromium's own viewer provides its canvas/controls).
  if (render.kind === 'pdf') {
    return <iframe title="pdf" src={render.url} className="min-h-0 flex-1 border-0 bg-white" />
  }

  // Image: neutral canvas, centered, zoomable.
  if (render.kind === 'image') {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-muted/50 p-6">
        <img
          src={render.url}
          alt=""
          style={{ width: zoom === 1 ? undefined : `${zoom * 100}%` }}
          className={cn(
            'rounded shadow-lg ring-1 ring-black/5',
            zoom === 1 && 'max-h-full max-w-full object-contain'
          )}
        />
      </div>
    )
  }

  // Sheets: tab bar + a document "sheet".
  if (render.kind === 'sheets') {
    const sheet = render.sheets[sheetIndex] ?? render.sheets[0]
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-muted/50">
        {render.sheets.length > 1 && (
          <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-card/60 px-3 py-1.5 backdrop-blur">
            {render.sheets.map((s, i) => (
              <button
                key={s.name}
                onClick={() => onSheet(i)}
                className={cn(
                  'rounded px-2.5 py-1 text-xs transition-colors',
                  i === sheetIndex
                    ? 'bg-primary/10 font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-accent'
                )}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-auto p-6">
          <Sheet>
            <div
              className="prose prose-sm max-w-none prose-table:my-0"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(sheet?.html ?? '') }}
            />
          </Sheet>
        </div>
      </div>
    )
  }

  // HTML (Word) and text: a centered reading "sheet".
  if (render.kind === 'html') {
    return (
      <Canvas>
        <Sheet wide>
          <div
            className="prose prose-base max-w-none"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(render.html) }}
          />
        </Sheet>
      </Canvas>
    )
  }
  if (render.kind === 'text') {
    return (
      <Canvas>
        <Sheet wide>
          <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-zinc-800">
            {render.text}
          </pre>
        </Sheet>
      </Canvas>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1 bg-muted/50 text-sm text-muted-foreground">
      <p>{render.reason}</p>
      <p>오른쪽 위 “외부 앱으로 열기”로 확인하세요.</p>
    </div>
  )
}

function Canvas({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="min-h-0 flex-1 overflow-auto bg-muted/50 p-6">{children}</div>
  )
}

// A white, shadowed document page — like a sheet in macOS Preview.
function Sheet({ children, wide }: { children: ReactNode; wide?: boolean }): JSX.Element {
  return (
    <div
      className={cn(
        'mx-auto rounded-lg bg-white p-10 text-zinc-900 shadow-md ring-1 ring-black/5',
        wide ? 'max-w-3xl' : 'w-fit min-w-full'
      )}
    >
      {children}
    </div>
  )
}

function ToolButton({
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
      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  )
}
