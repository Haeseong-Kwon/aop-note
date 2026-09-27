import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, FolderArchive, FolderPlus, Upload } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { toastError, useToast } from '@/store/useToast'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ancestorsOf } from '@shared/tree'
import { DocumentViewer } from './DocumentViewer'
import { DocFolderTree, type DocLocation, type MemoGroup } from './docs/DocFolderTree'
import { DocGrid } from './docs/DocGrid'
import { isDroppable, readDrop, type DropPayload } from './docs/dnd'
import type { AttachmentWithContext, DocFolder } from '@shared/types'

type Editing = { mode: 'create'; parentId: string | null } | { mode: 'rename'; folder: DocFolder }

const ROOT: DocLocation = { kind: 'folder', id: null }

/** The desk's 문서함: nested folders, uploads without a memo, drag-to-move, plus memo attachments by category. */
export function DocumentsView(): JSX.Element {
  const workspaceId = useStore((s) => s.activeWorkspaceId)
  const navigateToTask = useStore((s) => s.navigateToTask)
  const showToast = useToast((s) => s.show)

  const [docs, setDocs] = useState<AttachmentWithContext[]>([])
  const [folders, setFolders] = useState<DocFolder[]>([])
  const [location, setLocation] = useState<DocLocation>(ROOT)
  const [viewing, setViewing] = useState<AttachmentWithContext | null>(null)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [dropping, setDropping] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const reload = async (): Promise<void> => {
    if (!workspaceId) return
    const [nextDocs, nextFolders] = await Promise.all([
      window.api.attachment.listByWorkspace(workspaceId),
      window.api.docFolder.list(workspaceId)
    ])
    setDocs(nextDocs)
    setFolders(nextFolders)
  }

  useEffect(() => {
    setLocation(ROOT)
    reload().catch(toastError)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  const memoGroups = useMemo<MemoGroup[]>(() => {
    const map = new Map<string, MemoGroup>()
    for (const d of docs) {
      if (!d.category_id) continue
      const g = map.get(d.category_id)
      map.set(d.category_id, {
        id: d.category_id,
        name: d.category_name ?? '',
        color: d.category_color ?? '',
        count: (g?.count ?? 0) + 1
      })
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [docs])

  // A folder vanished (deleted elsewhere) → fall back to the top level.
  const folderId = location.kind === 'folder' ? location.id : null
  if (folderId && folders.length && !folders.some((f) => f.id === folderId)) setLocation(ROOT)

  const inCategory = location.kind === 'category'
  const subfolders = inCategory ? [] : folders.filter((f) => f.parent_id === folderId)
  // Top level shows desk uploads only; unfiled memo attachments live under 메모 첨부.
  const shownDocs = inCategory
    ? docs.filter((d) => d.category_id === location.id)
    : docs.filter((d) => d.folder_id === folderId && (folderId !== null || d.task_id === null))

  const run = async (action: () => Promise<unknown>, message?: string): Promise<void> => {
    try {
      await action()
      await reload()
      if (message) showToast({ message })
    } catch (e) {
      toastError(e)
    }
  }

  const upload = (files: File[], target: string | null): Promise<void> =>
    run(async () => {
      if (!workspaceId) return
      for (const f of files) {
        const path = window.api.getPathForFile(f)
        if (!path) throw new Error(`‘${f.name}’은(는) 파일로 올릴 수 없습니다.`)
        await window.api.attachment.upload({ workspace_id: workspaceId, folder_id: target, source_path: path, file_name: f.name })
      }
    }, `문서 ${files.length}개를 올렸습니다.`)

  const handleDrop = (target: string | null, payload: DropPayload): void => {
    if (payload.kind === 'files') void upload(payload.files, target)
    else if (payload.kind === 'doc') void run(() => window.api.attachment.move(payload.id, target))
    else if (payload.id !== target) void run(() => window.api.docFolder.move(payload.id, target))
  }

  const submitEditing = (name: string): void => {
    const edit = editing
    setEditing(null)
    if (!edit || !workspaceId || !name.trim()) return
    if (edit.mode === 'rename') void run(() => window.api.docFolder.rename(edit.folder.id, name))
    else void run(() => window.api.docFolder.create({ workspace_id: workspaceId, name, parent_id: edit.parentId }))
  }

  const deleteFolder = (folder: DocFolder): void =>
    void run(() => window.api.docFolder.remove(folder.id), `‘${folder.name}’ 폴더를 지웠습니다. 안의 문서는 상위 폴더로 옮겼습니다.`)

  return (
    <div className="flex h-full">
      <DocFolderTree
        folders={folders}
        memoGroups={memoGroups}
        location={location}
        onNavigate={setLocation}
        onDrop={handleDrop}
        onAddFolder={(parentId) => setEditing({ mode: 'create', parentId })}
        onRename={(folder) => setEditing({ mode: 'rename', folder })}
        onDelete={deleteFolder}
      />

      <section
        className={cn('flex min-w-0 flex-1 flex-col', dropping && 'bg-primary/5 ring-2 ring-inset ring-primary/40')}
        onDragOver={(e) => {
          if (inCategory || !isDroppable(e)) return
          e.preventDefault()
          setDropping(true)
        }}
        onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDropping(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDropping(false)
          const payload = readDrop(e)
          if (payload && !inCategory) handleDrop(folderId, payload)
        }}
      >
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-5">
          <Breadcrumb location={location} folders={folders} memoGroups={memoGroups} onNavigate={setLocation} />
          <div className="ml-auto flex items-center gap-2">
            {editing ? (
              <FolderNameInput
                initial={editing.mode === 'rename' ? editing.folder.name : ''}
                placeholder={editing.mode === 'rename' ? '폴더 이름' : '새 폴더 이름'}
                onSubmit={submitEditing}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <Button size="sm" variant="ghost" disabled={inCategory} onClick={() => setEditing({ mode: 'create', parentId: folderId })}>
                <FolderPlus className="h-4 w-4" />새 폴더
              </Button>
            )}
            <Button size="sm" disabled={inCategory} onClick={() => fileInput.current?.click()}>
              <Upload className="h-4 w-4" />
              업로드
            </Button>
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                const files = [...(e.target.files ?? [])]
                e.target.value = ''
                if (files.length) void upload(files, folderId)
              }}
            />
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {subfolders.length === 0 && shownDocs.length === 0 ? (
            <Empty inCategory={inCategory} />
          ) : (
            <DocGrid
              subfolders={subfolders}
              docs={shownDocs}
              allFolders={folders}
              onOpenFolder={(id) => setLocation({ kind: 'folder', id })}
              onOpenDoc={setViewing}
              onGoTask={(d) =>
                workspaceId &&
                d.task_id &&
                d.category_id &&
                navigateToTask({ workspace_id: workspaceId, category_id: d.category_id, task_id: d.task_id })
              }
              onMove={(docId, target) => void run(() => window.api.attachment.move(docId, target))}
              onDelete={(docId) => void run(() => window.api.attachment.remove(docId))}
              onDrop={handleDrop}
            />
          )}
        </div>
      </section>

      {viewing && <DocumentViewer attachmentId={viewing.id} fileName={viewing.file_name} onClose={() => setViewing(null)} />}
    </div>
  )
}

function Breadcrumb({
  location,
  folders,
  memoGroups,
  onNavigate
}: {
  location: DocLocation
  folders: DocFolder[]
  memoGroups: MemoGroup[]
  onNavigate: (loc: DocLocation) => void
}): JSX.Element {
  const current = location.kind === 'folder' ? folders.find((f) => f.id === location.id) : undefined
  const trail = current ? [...ancestorsOf(folders, current.id), current] : []
  const crumb = 'max-w-[12rem] truncate rounded px-1.5 py-0.5 hover:bg-accent'
  return (
    <nav aria-label="경로" className="flex min-w-0 items-center gap-0.5 text-sm">
      <FolderArchive className="mr-1 h-4 w-4 shrink-0 text-primary" />
      <button onClick={() => onNavigate(ROOT)} className={cn(crumb, 'font-semibold')}>
        문서함
      </button>
      {location.kind === 'category' && (
        <>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate px-1.5 text-muted-foreground">
            메모 첨부 · {memoGroups.find((g) => g.id === location.id)?.name}
          </span>
        </>
      )}
      {trail.map((f) => (
        <span key={f.id} className="flex min-w-0 items-center gap-0.5">
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <button onClick={() => onNavigate({ kind: 'folder', id: f.id })} className={crumb}>
            {f.name}
          </button>
        </span>
      ))}
    </nav>
  )
}

function FolderNameInput({
  initial,
  placeholder,
  onSubmit,
  onCancel
}: {
  initial: string
  placeholder: string
  onSubmit: (name: string) => void
  onCancel: () => void
}): JSX.Element {
  const [value, setValue] = useState(initial)
  return (
    <input
      autoFocus
      value={value}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onBlur={onCancel}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return // 한글 IME 조합 Enter 무시
        if (e.key === 'Enter') onSubmit(value)
        if (e.key === 'Escape') onCancel()
      }}
      className="h-8 w-48 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
    />
  )
}

function Empty({ inCategory }: { inCategory: boolean }): JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 p-10 text-center text-sm text-muted-foreground">
      <FolderArchive className="mb-2 h-8 w-8 opacity-40" />
      {inCategory ? (
        <p>이 카테고리의 메모에 첨부된 문서가 없습니다.</p>
      ) : (
        <>
          <p>이 폴더가 비어 있습니다.</p>
          <p>파일을 여기로 끌어오거나 ‘업로드’를 누르세요. 메모나 카테고리가 없어도 됩니다.</p>
        </>
      )}
    </div>
  )
}
