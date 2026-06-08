import { useEffect, useMemo, useState } from 'react'
import { FolderOpen, Folder, ChevronLeft, ArrowUpRight, Trash2, FolderArchive } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Button } from '@/components/ui/button'
import { DocumentViewer } from './DocumentViewer'
import { fileIconFor } from '@/lib/fileIcon'
import type { AttachmentWithContext } from '@shared/types'

interface FolderGroup {
  id: string
  name: string
  color: string
  docs: AttachmentWithContext[]
}

export function DocumentsView(): JSX.Element {
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId)
  const navigateToTask = useStore((s) => s.navigateToTask)

  const [docs, setDocs] = useState<AttachmentWithContext[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [viewing, setViewing] = useState<AttachmentWithContext | null>(null)

  const reload = async (): Promise<void> => {
    if (!activeWorkspaceId) return
    setDocs(await window.api.attachment.listByWorkspace(activeWorkspaceId))
  }

  useEffect(() => {
    reload()
    setOpenId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId])

  // Group documents into category "folders", preserving the query order.
  const folders = useMemo<FolderGroup[]>(() => {
    const map = new Map<string, FolderGroup>()
    for (const d of docs) {
      let g = map.get(d.category_id)
      if (!g) {
        g = { id: d.category_id, name: d.category_name, color: d.category_color, docs: [] }
        map.set(d.category_id, g)
      }
      g.docs.push(d)
    }
    return [...map.values()]
  }, [docs])

  const openFolder = openId ? folders.find((f) => f.id === openId) ?? null : null

  const remove = async (id: string): Promise<void> => {
    await window.api.attachment.remove(id)
    await reload()
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-5">
        {openFolder ? (
          <>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setOpenId(null)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <FolderOpen className="h-4 w-4 shrink-0" style={{ color: openFolder.color }} />
            <h2 className="truncate text-sm font-semibold">{openFolder.name}</h2>
            <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">
              {openFolder.docs.length}
            </span>
          </>
        ) : (
          <>
            <FolderArchive className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold tracking-tight">문서함</h2>
            <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">
              {docs.length}
            </span>
          </>
        )}
      </div>

      {docs.length === 0 ? (
        <Empty />
      ) : openFolder ? (
        <FileGrid
          docs={openFolder.docs}
          onOpen={setViewing}
          onDelete={remove}
          onGoTask={(d) =>
            activeWorkspaceId &&
            navigateToTask({
              workspace_id: activeWorkspaceId,
              category_id: d.category_id,
              task_id: d.task_id
            })
          }
        />
      ) : (
        <div className="grid flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 overflow-y-auto p-5">
          {folders.map((f) => (
            <button
              key={f.id}
              onClick={() => setOpenId(f.id)}
              className="group flex flex-col items-center gap-2 rounded-xl border border-transparent p-4 text-center transition-colors hover:border-border hover:bg-accent/40"
            >
              <Folder className="h-12 w-12" style={{ color: f.color }} fill="currentColor" fillOpacity={0.15} />
              <span className="line-clamp-2 text-sm font-medium">{f.name}</span>
              <span className="text-xs text-muted-foreground">{f.docs.length}개 문서</span>
            </button>
          ))}
        </div>
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

function FileGrid({
  docs,
  onOpen,
  onDelete,
  onGoTask
}: {
  docs: AttachmentWithContext[]
  onOpen: (d: AttachmentWithContext) => void
  onDelete: (id: string) => void
  onGoTask: (d: AttachmentWithContext) => void
}): JSX.Element {
  return (
    <div className="grid flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3 overflow-y-auto p-5">
      {docs.map((d) => {
        const Icon = fileIconFor(d.ext)
        return (
          <div
            key={d.id}
            className="group flex flex-col rounded-xl border border-border bg-card transition-shadow hover:shadow-md"
          >
            <button
              onClick={() => onOpen(d)}
              className="flex flex-1 flex-col items-center gap-2 px-3 pt-5 pb-3"
              title="문서 보기"
            >
              <Icon className="h-10 w-10 text-muted-foreground" />
              <span className="line-clamp-2 break-all text-center text-xs font-medium leading-snug">
                {d.file_name}
              </span>
            </button>
            <div className="flex items-center justify-between gap-1 border-t border-border px-2 py-1.5">
              <span className="truncate text-[11px] text-muted-foreground" title={d.task_title}>
                {d.task_title}
              </span>
              <div className="flex shrink-0 items-center">
                <button
                  onClick={() => onGoTask(d)}
                  title="작업 열기"
                  className="rounded p-1 text-muted-foreground/60 transition-colors hover:text-foreground"
                >
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => onDelete(d.id)}
                  title="삭제"
                  className="rounded p-1 text-muted-foreground/60 transition-colors hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Empty(): JSX.Element {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1 text-sm text-muted-foreground">
      <FolderArchive className="mb-2 h-8 w-8 opacity-40" />
      <p>아직 업로드된 문서가 없습니다.</p>
      <p>작업을 열어 문서를 첨부하면 카테고리별로 여기에 모입니다.</p>
    </div>
  )
}
