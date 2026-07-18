import { useRef, useState } from 'react'
import {
  Plus,
  Check,
  X,
  Search,
  Sun,
  CalendarCheck,
  Moon,
  Monitor,
  Pencil,
  Trash2,
  GripVertical
} from 'lucide-react'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useStore } from '@/store/useStore'
import { Button } from '@/components/ui/button'
import { DeskIcon } from './DeskIcon'
import { StylePicker } from './StylePicker'
import { cn } from '@/lib/utils'
import type { Theme } from '@/store/useStore'
import type { Workspace, UpdateWorkspaceInput } from '@shared/types'

const THEMES: { value: Theme; icon: typeof Sun; label: string }[] = [
  { value: 'light', icon: Sun, label: '라이트' },
  { value: 'dark', icon: Moon, label: '다크' },
  { value: 'system', icon: Monitor, label: '시스템' }
]

interface DeskRowProps {
  ws: Workspace
  active: boolean
  editing: boolean
  editName: string
  onEditNameChange: (v: string) => void
  onSelect: () => void
  onStartRename: () => void
  onSaveRename: () => void
  onCancelRename: () => void
  onDelete: () => void
}

function DeskRow({
  ws,
  active,
  editing,
  editName,
  onEditNameChange,
  onSelect,
  onStartRename,
  onSaveRename,
  onCancelRename,
  onDelete
}: DeskRowProps): JSX.Element {
  const updateWorkspace = useStore((s) => s.updateWorkspace)
  const [pickerOpen, setPickerOpen] = useState(false)
  const iconBtnRef = useRef<HTMLButtonElement>(null)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: ws.id
  })

  if (editing) {
    return (
      <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}>
        <div className="flex items-center gap-1 px-1">
          <input
            autoFocus
            value={editName}
            onChange={(e) => onEditNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return // 한글 IME 조합 Enter 무시
              if (e.key === 'Enter') onSaveRename()
              if (e.key === 'Escape') onCancelRename()
            }}
            className="no-drag h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onSaveRename}>
            <Check className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onCancelRename}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'group relative flex items-center gap-1.5 rounded-md px-2 py-2 text-sm transition-colors',
        active
          ? 'bg-accent font-medium text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
        isDragging && 'z-10 opacity-80'
      )}
    >
      <button
        {...attributes}
        {...listeners}
        title="드래그하여 순서 변경"
        className="no-drag -ml-0.5 cursor-grab touch-none text-muted-foreground/30 opacity-0 transition hover:text-foreground group-hover:opacity-100 active:cursor-grabbing"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      <button
        ref={iconBtnRef}
        onClick={() => setPickerOpen((v) => !v)}
        title="색상·아이콘 변경"
        className="no-drag flex h-5 w-5 items-center justify-center rounded transition-colors hover:bg-accent"
      >
        <DeskIcon color={ws.color} icon={ws.icon} />
      </button>
      {pickerOpen && (
        <StylePicker
          anchorEl={iconBtnRef.current}
          color={ws.color}
          icon={ws.icon}
          onChange={(next) => updateWorkspace({ id: ws.id, ...next })}
          onClose={() => setPickerOpen(false)}
        />
      )}

      <button onClick={onSelect} className="no-drag min-w-0 flex-1 truncate text-left">
        {ws.name}
      </button>
      <div className="flex items-center opacity-0 transition-opacity group-hover:opacity-100">
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          onClick={onStartRename}
          title="이름 변경"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onDelete} title="삭제">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

export function Sidebar(): JSX.Element {
  const workspaces = useStore((s) => s.workspaces)
  const activeId = useStore((s) => s.activeWorkspaceId)
  const smartView = useStore((s) => s.smartView)
  const selectWorkspace = useStore((s) => s.selectWorkspace)
  const createWorkspace = useStore((s) => s.createWorkspace)
  const selectSmartView = useStore((s) => s.selectSmartView)
  const openPalette = useStore((s) => s.openPalette)
  const renameWorkspace = useStore((s) => s.renameWorkspace)
  const reorderWorkspaces = useStore((s) => s.reorderWorkspaces)
  const deleteWorkspace = useStore((s) => s.deleteWorkspace)
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)

  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // On macOS the traffic-light buttons overlay the top-left; inset the brand below them.
  const isMac = navigator.userAgent.includes('Macintosh')

  const submit = async (): Promise<void> => {
    await createWorkspace(name)
    setName('')
    setAdding(false)
  }

  const startRename = (id: string, current: string): void => {
    setEditingId(id)
    setEditName(current)
  }
  const saveRename = async (): Promise<void> => {
    if (editingId) await renameWorkspace(editingId, editName)
    setEditingId(null)
  }
  const confirmDelete = (id: string, deskName: string): void => {
    if (window.confirm(`'${deskName}' 데스크와 포함된 모든 카테고리·작업이 삭제됩니다. 계속할까요?`)) {
      deleteWorkspace(id)
    }
  }

  const onDragEnd = (e: DragEndEvent): void => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = workspaces.findIndex((w) => w.id === active.id)
    const to = workspaces.findIndex((w) => w.id === over.id)
    if (from < 0 || to < 0) return
    const reordered = arrayMove(workspaces, from, to)
    const updates: UpdateWorkspaceInput[] = reordered.map((w, i) => ({ id: w.id, sort_order: i }))
    reorderWorkspaces(updates)
  }

  return (
    <aside className="glass-chrome glass-pane flex w-60 shrink-0 flex-col">
      <div
        className={cn(
          'drag-region flex shrink-0 items-center gap-2.5 px-4 pb-3',
          isMac ? 'pt-8' : 'pt-4'
        )}
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-primary/90 text-sm font-bold text-primary-foreground shadow-sm">
          A
        </div>
        <div className="flex min-w-0 flex-col leading-none">
          <span className="text-[15px] font-semibold tracking-tight">AOP Note</span>
          <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            업무 메모
          </span>
        </div>
      </div>

      <div className="px-2 pt-1">
        <button
          onClick={openPalette}
          className="no-drag flex w-full items-center gap-2 rounded-md border border-border bg-background/60 px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-accent"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="flex-1">검색 / 이동</span>
          <kbd className="rounded bg-muted px-1 text-[10px]">⌘P</kbd>
        </button>
      </div>

      {/* Smart views — cross-workspace, due-date driven */}
      <nav className="space-y-0.5 px-2 pt-2">
        <SmartItem
          icon={Sun}
          label="오늘"
          active={smartView === 'today'}
          onClick={() => selectSmartView('today')}
        />
        <SmartItem
          icon={CalendarCheck}
          label="이번 주"
          active={smartView === 'week'}
          onClick={() => selectSmartView('week')}
        />
      </nav>

      <div className="px-4 pb-2 pt-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">데스크</h2>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext
            items={workspaces.map((w) => w.id)}
            strategy={verticalListSortingStrategy}
          >
            {workspaces.map((ws) => (
              <DeskRow
                key={ws.id}
                ws={ws}
                active={ws.id === activeId && smartView === null}
                editing={editingId === ws.id}
                editName={editName}
                onEditNameChange={setEditName}
                onSelect={() => selectWorkspace(ws.id)}
                onStartRename={() => startRename(ws.id, ws.name)}
                onSaveRename={saveRename}
                onCancelRename={() => setEditingId(null)}
                onDelete={() => confirmDelete(ws.id, ws.name)}
              />
            ))}
          </SortableContext>
        </DndContext>

        {workspaces.length === 0 && !adding && (
          <p className="px-3 py-2 text-xs text-muted-foreground">아직 데스크가 없습니다.</p>
        )}
      </nav>

      <div className="space-y-2 border-t border-border p-2">
        {adding ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return // 한글 IME 조합 Enter 무시
                if (e.key === 'Enter') submit()
                if (e.key === 'Escape') {
                  setAdding(false)
                  setName('')
                }
              }}
              placeholder="데스크 이름"
              className="no-drag h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={submit}>
              <Check className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => {
                setAdding(false)
                setName('')
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground"
            onClick={() => setAdding(true)}
          >
            <Plus className="h-4 w-4" />새 데스크
          </Button>
        )}

        {/* Theme switch */}
        <div className="flex items-center gap-1 rounded-md bg-muted/50 p-1">
          {THEMES.map(({ value, icon: Icon, label }) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              title={label}
              className={cn(
                'no-drag flex flex-1 items-center justify-center rounded py-1 transition-colors',
                theme === value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      </div>
    </aside>
  )
}

function SmartItem({
  icon: Icon,
  label,
  active,
  onClick
}: {
  icon: typeof Sun
  label: string
  active: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={cn(
        'no-drag flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors',
        active
          ? 'bg-accent font-medium text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  )
}
