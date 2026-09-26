import { useEffect, useState } from 'react'
import { FileText, FolderOpen, Link2 } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { toastError } from '@/store/useToast'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { MarkdownView } from './MarkdownView'
import type { FileBacklinks, ProjectFile } from '@shared/types'

/** "docs/a.md" + "../b.md" → "b.md" (POSIX, no escaping above the project root). */
function joinPath(fromFile: string, href: string): string {
  const parts = fromFile.split('/').slice(0, -1)
  for (const seg of href.split('#')[0].split('/')) {
    if (seg === '..') parts.pop()
    else if (seg && seg !== '.') parts.push(decodeURIComponent(seg))
  }
  return parts.join('/')
}

/** Read-only view of a document from a desk's linked project folder. */
export function FilePreview(): JSX.Element | null {
  const open = useStore((s) => s.openFile)
  const close = useStore((s) => s.closeFile)
  const previewFile = useStore((s) => s.previewFile)
  const openNote = useStore((s) => s.openNote)
  const version = useStore((s) => s.projectVersion)
  const [file, setFile] = useState<ProjectFile | null>(null)
  const [back, setBack] = useState<FileBacklinks | null>(null)

  useEffect(() => {
    if (!open) return
    let current = true
    setFile(null)
    setBack(null)
    window.api.project.readFile(open.deskId, open.path).then((f) => current && setFile(f), (e) => {
      toastError(e)
      close()
    })
    window.api.link.fileBacklinks(open.deskId, open.path).then((b) => current && setBack(b), toastError)
    return () => {
      current = false
    }
  }, [open, version, close])

  if (!open) return null

  const followLink = (href: string): void => {
    if (/^(https?:|mailto:)/i.test(href)) {
      window.open(href, '_blank') // main hands this to the default browser
      return
    }
    if (href.startsWith('#')) return
    previewFile(open.deskId, joinPath(open.path, href))
  }

  const count = (back?.linked.length ?? 0) + (back?.files.length ?? 0)

  return (
    <Dialog open onOpenChange={(o) => (o ? null : close())}>
      <DialogContent className="flex h-[85vh] max-w-3xl flex-col gap-0 p-0">
        <header className="flex shrink-0 items-center gap-2.5 border-b border-border px-5 py-3 pr-12">
          <FileText className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{file?.title ?? open.path}</p>
            <p className="truncate font-mono text-[11px] text-muted-foreground">{open.path}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.api.project.reveal(open.deskId, open.path).catch(toastError)}
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Finder에서 보기
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
          {file ? (
            <MarkdownView source={file.content} onLinkClick={followLink} />
          ) : (
            <p className="text-sm text-muted-foreground">불러오는 중…</p>
          )}

          {back && (
            <section className="mt-10 border-t border-border pt-4" aria-label="이 문서의 백링크">
              <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Link2 className="h-3.5 w-3.5" />이 문서를 링크한 곳 {count}
              </h3>
              <ul className="mt-1">
                {back.linked.map((h) => (
                  <li key={h.task.id}>
                    <button
                      onClick={() => {
                        close()
                        void openNote(h.task)
                      }}
                      className="w-full rounded-md px-2 py-1.5 text-left hover:bg-accent/60"
                    >
                      <span className="block truncate text-sm font-medium">{h.task.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">{h.snippet}</span>
                    </button>
                  </li>
                ))}
                {back.files.map((f) => (
                  <li key={f.path}>
                    <button
                      onClick={() => previewFile(f.workspace_id, f.path)}
                      className="w-full rounded-md px-2 py-1.5 text-left hover:bg-accent/60"
                    >
                      <span className="block truncate text-sm font-medium">
                        {f.title} <span className="font-mono text-[11px] font-normal text-muted-foreground">{f.path}</span>
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">{f.snippet}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
