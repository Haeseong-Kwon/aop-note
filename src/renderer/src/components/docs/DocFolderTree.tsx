import { useState, type DragEvent, type ReactNode } from 'react'
import { ChevronRight, Folder, FolderArchive, FolderPlus, Paperclip, Pencil, Trash2 } from 'lucide-react'
import { flattenTree } from '@shared/tree'
import { cn } from '@/lib/utils'
import type { DocFolder } from '@shared/types'
import { FOLDER_MIME, isDroppable, readDrop, type DropPayload } from './dnd'

export type DocLocation = { kind: 'folder'; id: string | null } | { kind: 'category'; id: string }

export interface MemoGroup {
  id: string
  name: string
  color: string
  count: number
}

const INDENT_PX = 14

interface DropRowProps {
  target: string | null
  onDrop: (target: string | null, payload: DropPayload) => void
  className: string
  style?: React.CSSProperties
  draggableId?: string
  children: ReactNode
}

/** A row that takes drops (documents, folders, Finder files) into `target` folder. */
function DropRow({ target, onDrop, className, style, draggableId, children }: DropRowProps): JSX.Element {
  const [over, setOver] = useState(false)
  const handleDrop = (e: DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    setOver(false)
    const payload = readDrop(e)
    if (payload) onDrop(target, payload)
  }
  return (
    <div
      draggable={Boolean(draggableId)}
      onDragStart={(e) => draggableId && e.dataTransfer.setData(FOLDER_MIME, draggableId)}
      onDragOver={(e) => {
        if (!isDroppable(e)) return
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={handleDrop}
      className={cn(className, over && 'bg-primary/10 ring-1 ring-primary/40')}
      style={style}
    >
      {children}
    </div>
  )
}

interface DocFolderTreeProps {
  folders: DocFolder[]
  memoGroups: MemoGroup[]
  location: DocLocation
  onNavigate: (loc: DocLocation) => void
  onDrop: (target: string | null, payload: DropPayload) => void
  onAddFolder: (parentId: string | null) => void
  onRename: (folder: DocFolder) => void
  onDelete: (folder: DocFolder) => void
}

export function DocFolderTree(props: DocFolderTreeProps): JSX.Element {
  const { folders, memoGroups, location, onNavigate, onDrop } = props
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const toggle = (id: string): void =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })
  const isAt = (kind: DocLocation['kind'], id: string | null): boolean => location.kind === kind && location.id === id
  const rowClass = (active: boolean): string =>
    cn(
      'group flex h-[30px] items-center gap-1 rounded-md pr-1 text-sm transition-colors',
      active ? 'bg-accent font-medium text-foreground' : 'text-foreground/80 hover:bg-accent/60'
    )

  return (
    <aside className="glass-chrome flex w-60 shrink-0 flex-col border-r border-border">
      <div className="flex h-12 items-center justify-between px-4">
        <h2 className="text-sm font-semibold tracking-tight">폴더</h2>
        <button
          onClick={() => props.onAddFolder(null)}
          title="새 폴더"
          className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <FolderPlus className="h-4 w-4" />
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        <DropRow target={null} onDrop={onDrop} className={cn(rowClass(isAt('folder', null)), 'pl-2')}>
          <button onClick={() => onNavigate({ kind: 'folder', id: null })} className="flex flex-1 items-center gap-2 text-left">
            <FolderArchive className="h-4 w-4 text-primary" />
            문서함
          </button>
        </DropRow>

        {flattenTree(folders, collapsed).map(({ item: f, depth, hasChildren }) => (
          <DropRow
            key={f.id}
            target={f.id}
            draggableId={f.id}
            onDrop={onDrop}
            className={rowClass(isAt('folder', f.id))}
            style={{ paddingLeft: 4 + (depth + 1) * INDENT_PX }}
          >
            <button
              onClick={() => toggle(f.id)}
              disabled={!hasChildren}
              aria-label={collapsed.has(f.id) ? '펼치기' : '접기'}
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent disabled:invisible"
            >
              <ChevronRight className={cn('h-3 w-3 transition-transform', !collapsed.has(f.id) && 'rotate-90')} />
            </button>
            <button
              onClick={() => onNavigate({ kind: 'folder', id: f.id })}
              onDoubleClick={() => props.onRename(f)}
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
            >
              <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{f.name}</span>
            </button>
            <div className="flex items-center opacity-0 transition-opacity group-hover:opacity-100">
              <IconButton title="하위 폴더" onClick={() => props.onAddFolder(f.id)}>
                <FolderPlus className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton title="이름 바꾸기" onClick={() => props.onRename(f)}>
                <Pencil className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton title="폴더 삭제 (안의 문서는 상위 폴더로)" onClick={() => props.onDelete(f)}>
                <Trash2 className="h-3.5 w-3.5" />
              </IconButton>
            </div>
          </DropRow>
        ))}

        {memoGroups.length > 0 && (
          <>
            <p className="px-2 pb-1 pt-4 text-xs font-medium text-muted-foreground">메모 첨부</p>
            {memoGroups.map((g) => (
              <button
                key={g.id}
                onClick={() => onNavigate({ kind: 'category', id: g.id })}
                className={cn(rowClass(isAt('category', g.id)), 'w-full pl-2 text-left')}
              >
                <Paperclip className="h-3.5 w-3.5 shrink-0" style={{ color: g.color }} />
                <span className="flex-1 truncate">{g.name}</span>
                <span className="text-[11px] tabular-nums text-muted-foreground">{g.count}</span>
              </button>
            ))}
          </>
        )}
      </nav>
    </aside>
  )
}

function IconButton({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }): JSX.Element {
  return (
    <button title={title} onClick={onClick} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
      {children}
    </button>
  )
}
