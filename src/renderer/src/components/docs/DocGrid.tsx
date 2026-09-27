import { useState } from 'react'
import { ArrowUpRight, Folder, FolderInput, Trash2 } from 'lucide-react'
import { flattenTree } from '@shared/tree'
import { fileIconFor } from '@/lib/fileIcon'
import { cn } from '@/lib/utils'
import type { AttachmentWithContext, DocFolder } from '@shared/types'
import { DOC_MIME, FOLDER_MIME, isDroppable, readDrop, type DropPayload } from './dnd'

interface DocGridProps {
  subfolders: DocFolder[]
  docs: AttachmentWithContext[]
  allFolders: DocFolder[]
  onOpenFolder: (id: string) => void
  onOpenDoc: (doc: AttachmentWithContext) => void
  onGoTask: (doc: AttachmentWithContext) => void
  onMove: (docId: string, folderId: string | null) => void
  onDelete: (docId: string) => void
  onDrop: (target: string | null, payload: DropPayload) => void
}

export function DocGrid(props: DocGridProps): JSX.Element {
  return (
    <div className="grid auto-rows-min grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3 p-5">
      {props.subfolders.map((f) => (
        <FolderTile key={f.id} folder={f} onOpen={() => props.onOpenFolder(f.id)} onDrop={props.onDrop} />
      ))}
      {props.docs.map((d) => (
        <FileCard key={d.id} doc={d} {...props} />
      ))}
    </div>
  )
}

function FolderTile({
  folder,
  onOpen,
  onDrop
}: {
  folder: DocFolder
  onOpen: () => void
  onDrop: DocGridProps['onDrop']
}): JSX.Element {
  const [over, setOver] = useState(false)
  return (
    <button
      draggable
      onDragStart={(e) => e.dataTransfer.setData(FOLDER_MIME, folder.id)}
      onDragOver={(e) => {
        if (!isDroppable(e)) return
        e.preventDefault()
        e.stopPropagation()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setOver(false)
        const payload = readDrop(e)
        if (payload) onDrop(folder.id, payload)
      }}
      onClick={onOpen}
      className={cn(
        'flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-colors',
        over ? 'border-primary bg-primary/10' : 'border-transparent hover:border-border hover:bg-accent/40'
      )}
    >
      <Folder className="h-12 w-12 text-primary/70" fill="currentColor" fillOpacity={0.15} />
      <span className="line-clamp-2 text-sm font-medium">{folder.name}</span>
    </button>
  )
}

function FileCard({
  doc,
  allFolders,
  onOpenDoc,
  onGoTask,
  onMove,
  onDelete
}: DocGridProps & { doc: AttachmentWithContext }): JSX.Element {
  const [moving, setMoving] = useState(false)
  const Icon = fileIconFor(doc.ext)
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData(DOC_MIME, doc.id)}
      className="group relative flex flex-col rounded-xl border border-border bg-card transition-shadow hover:shadow-md"
    >
      <button onClick={() => onOpenDoc(doc)} className="flex flex-1 flex-col items-center gap-2 px-3 pb-3 pt-5" title="문서 보기">
        <Icon className="h-10 w-10 text-muted-foreground" />
        <span className="line-clamp-2 break-all text-center text-xs font-medium leading-snug">{doc.file_name}</span>
      </button>
      <div className="flex items-center justify-between gap-1 border-t border-border px-2 py-1.5">
        {doc.task_title !== null ? (
          <button
            onClick={() => onGoTask(doc)}
            title="첨부된 메모 열기"
            className="flex min-w-0 items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <span className="truncate">{doc.task_title}</span>
            <ArrowUpRight className="h-3 w-3 shrink-0" />
          </button>
        ) : (
          <span className="text-[11px] text-muted-foreground">{formatSize(doc.size)}</span>
        )}
        <div className="flex shrink-0 items-center">
          <button
            onClick={() => setMoving((v) => !v)}
            title="폴더로 이동"
            className="rounded p-1 text-muted-foreground/60 transition-colors hover:text-foreground"
          >
            <FolderInput className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onDelete(doc.id)}
            title="삭제"
            className="rounded p-1 text-muted-foreground/60 transition-colors hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {moving && (
        <MoveMenu
          folders={allFolders}
          current={doc.folder_id}
          onPick={(id) => {
            setMoving(false)
            onMove(doc.id, id)
          }}
          onClose={() => setMoving(false)}
        />
      )}
    </div>
  )
}

function MoveMenu({
  folders,
  current,
  onPick,
  onClose
}: {
  folders: DocFolder[]
  current: string | null
  onPick: (id: string | null) => void
  onClose: () => void
}): JSX.Element {
  const options: { id: string | null; name: string; depth: number }[] = [
    { id: null, name: '문서함 (최상위)', depth: 0 },
    ...flattenTree(folders).map(({ item, depth }) => ({ id: item.id, name: item.name, depth: depth + 1 }))
  ]
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        role="menu"
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
        className="absolute bottom-10 right-1 z-50 max-h-64 w-52 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-sm shadow-lg"
      >
        <p className="px-2 py-1 text-[11px] font-medium text-muted-foreground">이동할 폴더</p>
        {options.map((o) => (
          <button
            key={o.id ?? 'root'}
            role="menuitem"
            disabled={o.id === current}
            onClick={() => onPick(o.id)}
            className="flex w-full items-center gap-1.5 truncate rounded px-2 py-1 text-left hover:bg-accent disabled:opacity-40"
            style={{ paddingLeft: 8 + o.depth * 12 }}
          >
            <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{o.name}</span>
          </button>
        ))}
      </div>
    </>
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
