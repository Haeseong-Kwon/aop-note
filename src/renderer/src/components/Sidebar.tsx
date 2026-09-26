import { useRef, useState } from 'react'
import {
  Plus,
  Check,
  X,
  Search,
  SquarePen,
  Sun,
  CalendarCheck,
  Moon,
  Monitor,
  Pencil,
  Trash2,
  GripVertical,
  ChevronsLeft,
  ChevronsRight,
  Keyboard,
  Settings,
  Waypoints,
  FolderGit2,
  type LucideIcon,
  Sparkles
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
import { cn, IS_MAC } from '@/lib/utils'
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
        'group relative flex h-[30px] items-center gap-1.5 rounded-md px-2 text-sm transition-colors',
        active
          ? 'bg-accent font-medium text-foreground'
          : 'text-foreground/80 hover:bg-accent/60 hover:text-foreground',
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
  const utilityView = useStore((s) => s.utilityView)
  const openUtility = useStore((s) => s.openUtility)
  const selectWorkspace = useStore((s) => s.selectWorkspace)
  const createWorkspace = useStore((s) => s.createWorkspace)
  const selectSmartView = useStore((s) => s.selectSmartView)
  const openPalette = useStore((s) => s.openPalette)
  const openQuickCapture = useStore((s) => s.openQuickCapture)
  const toggleHelp = useStore((s) => s.toggleHelp)
  const toggleSidebar = useStore((s) => s.toggleSidebar)
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

  const submit = async (): Promise<void> => {
    if (name.trim()) await createWorkspace(name)
    setName('')
    setAdding(false)
  }
  const cancelAdd = (): void => {
    setAdding(false)
    setName('')
  }

  const startRename = (id: string, current: string): void => {
    setEditingId(id)
    setEditName(current)
  }
  const saveRename = async (): Promise<void> => {
    if (editingId) await renameWorkspace(editingId, editName)
    setEditingId(null)
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
    <aside className="glass-chrome glass-pane group/sidebar flex w-60 shrink-0 flex-col">
      {/* On macOS the traffic lights sit in the top-left, so the brand row starts below them. */}
      <div className={cn('drag-region flex shrink-0 items-center gap-2 px-3 pb-2', IS_MAC ? 'pt-9' : 'pt-3')}>
        <div className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground">
          A
        </div>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">AOP Note</span>
        <button
          onClick={toggleSidebar}
          title="사이드바 접기 (⌘\)"
          aria-label="사이드바 접기"
          className="no-drag flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/sidebar:opacity-100"
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>
      </div>

      <nav className="space-y-px px-2">
        <NavItem icon={Search} label="검색" hint="⌘P" onClick={openPalette} />
        <NavItem icon={SquarePen} label="빠른 추가" hint="⌘N" onClick={() => openQuickCapture()} />
        <NavItem
          icon={Sun}
          label="오늘"
          active={smartView === 'today' && !utilityView}
          onClick={() => selectSmartView('today')}
        />
        <NavItem
          icon={CalendarCheck}
          label="이번 주"
          active={smartView === 'week' && !utilityView}
          onClick={() => selectSmartView('week')}
        />
        <NavItem
          icon={Waypoints}
          label="그래프"
          active={utilityView === 'graph'}
          onClick={() => openUtility('graph')}
        />
        <NavItem
          icon={FolderGit2}
          label="프로젝트"
          active={utilityView === 'projects'}
          onClick={() => openUtility('projects')}
        />
        <NavItem
          icon={Sparkles}
          label="AI에게 묻기"
          active={utilityView === 'ask'}
          onClick={() => openUtility('ask')}
        />
      </nav>

      <div className="group/section mt-5 flex items-center justify-between px-4 pb-1">
        <h2 className="text-xs font-medium text-muted-foreground">데스크</h2>
        <button
          onClick={() => setAdding(true)}
          title="새 데스크"
          aria-label="새 데스크"
          className="no-drag -mr-1 flex h-5 w-5 items-center justify-center rounded text-muted-foreground opacity-0 transition hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/section:opacity-100"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <nav className="flex-1 space-y-px overflow-y-auto px-2 pb-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext
            items={workspaces.map((w) => w.id)}
            strategy={verticalListSortingStrategy}
          >
            {workspaces.map((ws) => (
              <DeskRow
                key={ws.id}
                ws={ws}
                active={ws.id === activeId && smartView === null && !utilityView}
                editing={editingId === ws.id}
                editName={editName}
                onEditNameChange={setEditName}
                onSelect={() => selectWorkspace(ws.id)}
                onStartRename={() => startRename(ws.id, ws.name)}
                onSaveRename={saveRename}
                onCancelRename={() => setEditingId(null)}
                onDelete={() => deleteWorkspace(ws.id)}
              />
            ))}
          </SortableContext>
        </DndContext>

        {adding ? (
          <div className="px-1 py-0.5">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={submit}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return // 한글 IME 조합 Enter 무시
                if (e.key === 'Enter') submit()
                if (e.key === 'Escape') cancelAdd()
              }}
              placeholder="데스크 이름"
              className="no-drag h-[30px] w-full rounded-md border border-input bg-background/70 px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        ) : (
          <NavItem icon={Plus} label="새 데스크" muted onClick={() => setAdding(true)} />
        )}
      </nav>

      <nav className="space-y-px px-2 pb-2">
        <NavItem
          icon={Trash2}
          label="휴지통"
          active={utilityView === 'trash'}
          onClick={() => openUtility('trash')}
        />
        <NavItem
          icon={Settings}
          label="설정"
          active={utilityView === 'settings'}
          onClick={() => openUtility('settings')}
        />
      </nav>

      <div className="glass-divider flex items-center gap-1 border-t px-2 py-2">
        <div className="flex flex-1 items-center gap-0.5 rounded-md bg-muted/50 p-0.5">
          {THEMES.map(({ value, icon: Icon, label }) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              title={label}
              aria-label={`${label} 테마`}
              aria-pressed={theme === value}
              className={cn(
                'no-drag flex h-6 flex-1 items-center justify-center rounded transition-colors',
                theme === value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
        <button
          onClick={toggleHelp}
          title="키보드 단축키 (?)"
          aria-label="키보드 단축키"
          className="no-drag flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Keyboard className="h-4 w-4" />
        </button>
      </div>
    </aside>
  )
}

interface NavItemProps {
  icon: LucideIcon
  label: string
  active?: boolean
  /** Shortcut shown on hover, Notion/Linear style. */
  hint?: string
  muted?: boolean
  onClick: () => void
}

function NavItem({ icon: Icon, label, active = false, hint, muted = false, onClick }: NavItemProps): JSX.Element {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'no-drag group flex h-[30px] w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors',
        active
          ? 'bg-accent font-medium text-foreground'
          : muted
            ? 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
            : 'text-foreground/80 hover:bg-accent/60 hover:text-foreground'
      )}
    >
      <Icon className="h-4 w-4 shrink-0 opacity-80" />
      <span className="flex-1 truncate">{label}</span>
      {hint && (
        <kbd className="font-sans text-[11px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
          {hint}
        </kbd>
      )}
    </button>
  )
}

/** Shown at the start of a page header while the sidebar is collapsed. */
export function SidebarExpandButton(): JSX.Element | null {
  const collapsed = useStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useStore((s) => s.toggleSidebar)
  if (!collapsed) return null
  return (
    <button
      onClick={toggleSidebar}
      title="사이드바 열기 (⌘\)"
      aria-label="사이드바 열기"
      // Clears the macOS traffic lights, which now float over this header.
      className={cn(
        'no-drag flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
        IS_MAC && 'ml-[60px]'
      )}
    >
      <ChevronsRight className="h-4 w-4" />
    </button>
  )
}
