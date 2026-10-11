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
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Keyboard,
  Settings,
  Waypoints,
  FolderGit2,
  CalendarDays,
  Wrench,
  type LucideIcon,
  Sparkles
} from 'lucide-react'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
  type DragMoveEvent
} from '@dnd-kit/core'
import { SortableContext, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useStore } from '@/store/useStore'
import { Button } from '@/components/ui/button'
import { DeskIcon } from './DeskIcon'
import { StylePicker } from './StylePicker'
import { cn, IS_MAC, shortcut } from '@/lib/utils'
import type { Theme } from '@/store/useStore'
import { flattenTree, planTreeDrop, type DropMode } from '@shared/tree'
import type { Workspace } from '@shared/types'
import { ResizablePane } from '@/components/ui/ResizablePane'

const INDENT_PX = 14
/** Top/bottom share of a row that means "drop beside"; the middle means "drop inside". */
const EDGE_ZONE = 0.25
/** Rows stay put while dragging; the drop indicator shows where the desk will land. */
const noShift = (): null => null
const KEY_MOVES: Partial<Record<string, 'up' | 'down' | 'in' | 'out'>> = { ArrowUp: 'up', ArrowDown: 'down', ArrowRight: 'in', ArrowLeft: 'out' }

const THEMES: { value: Theme; icon: typeof Sun; label: string }[] = [
  { value: 'light', icon: Sun, label: '라이트' },
  { value: 'dark', icon: Moon, label: '다크' },
  { value: 'system', icon: Monitor, label: '시스템' }
]

interface DeskRowProps {
  ws: Workspace
  depth: number
  /** undefined = no sub-desks (no chevron) */
  collapsed?: boolean
  /** Where the dragged desk would land relative to this row. */
  drop?: DropMode
  /** Keyboard move from the grip: Alt+↑/↓ reorder, Alt+→ into the desk above, Alt+← out one level. */
  onKeyMove: (key: 'up' | 'down' | 'in' | 'out') => void
  onToggle: () => void
  onAddChild: () => void
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
  depth,
  collapsed,
  drop,
  onKeyMove,
  onToggle,
  onAddChild,
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
      className={cn(
        'group relative flex h-[30px] items-center gap-1.5 rounded-md pr-2 text-sm transition-colors',
        active
          ? 'bg-desk/[0.11] font-medium text-foreground'
          : 'text-foreground/80 hover:bg-accent/60 hover:text-foreground',
        isDragging && 'z-10 opacity-80',
        drop === 'inside' && 'bg-primary/10 ring-1 ring-inset ring-primary/60'
      )}
      style={{ transform: CSS.Transform.toString(transform), transition, paddingLeft: 8 + depth * INDENT_PX }}
    >
      {(drop === 'before' || drop === 'after') && (
        <span
          aria-hidden
          className={cn('pointer-events-none absolute right-1 h-0.5 rounded bg-primary', drop === 'before' ? '-top-px' : '-bottom-px')}
          style={{ left: 8 + depth * INDENT_PX }}
        />
      )}
      <button
        {...attributes}
        data-desk-grip={ws.id}
        {...listeners}
        title="드래그: 위·아래 가장자리 = 순서 변경, 가운데 = 하위로 넣기 · 키보드: Alt + 화살표"
        aria-label={`'${ws.name}' 이동 (Alt+위/아래: 순서, Alt+오른쪽: 위 데스크 안으로, Alt+왼쪽: 한 단계 밖으로)`}
        onKeyDown={(e) => {
          const key = e.altKey ? KEY_MOVES[e.key] : undefined
          if (!key) return
          e.preventDefault()
          e.stopPropagation()
          onKeyMove(key)
        }}
        className="no-drag -ml-0.5 cursor-grab touch-none text-muted-foreground/30 opacity-0 transition hover:text-foreground group-hover:opacity-100 group-has-[:focus-visible]:opacity-100 active:cursor-grabbing"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={onToggle}
        disabled={collapsed === undefined}
        aria-label={collapsed ? '하위 데스크 펼치기' : '하위 데스크 접기'}
        className="no-drag -mx-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent disabled:hidden"
      >
        <ChevronRight className={cn('h-3 w-3 transition-transform', !collapsed && 'rotate-90')} />
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
      <div className="flex items-center opacity-0 transition-opacity group-hover:opacity-100 group-has-[:focus-visible]:opacity-100">
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onAddChild} title="하위 데스크 추가">
          <Plus className="h-3.5 w-3.5" />
        </Button>
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

  // false = not adding; null = new top-level desk; id = new sub-desk of that desk
  const [adding, setAdding] = useState<false | string | null>(false)
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const [name, setName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [dropTarget, setDropTarget] = useState<{ id: string; mode: DropMode } | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const submit = async (): Promise<void> => {
    if (name.trim() && adding !== false) await createWorkspace(name, adding)
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

  const rows = flattenTree(workspaces, collapsed)
  const toggle = (id: string): void =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })
  const startAddChild = (parentId: string): void => {
    setCollapsed((prev) => new Set([...prev].filter((id) => id !== parentId)))
    setName('')
    setAdding(parentId)
  }

  // Drag a desk: near a row's top/bottom edge = place beside it, middle = nest inside it.
  const dropOf = (e: DragMoveEvent | DragEndEvent): { id: string; mode: DropMode } | null => {
    const { active, over } = e
    const box = active.rect.current.translated
    if (!over || !box) return null
    const ratio = (box.top + box.height / 2 - over.rect.top) / over.rect.height
    const mode: DropMode = ratio < EDGE_ZONE ? 'before' : ratio > 1 - EDGE_ZONE ? 'after' : 'inside'
    const id = String(over.id)
    return planTreeDrop(workspaces, String(active.id), id, mode) ? { id, mode } : null
  }
  const moveByKey = (id: string, key: 'up' | 'down' | 'in' | 'out'): void => {
    const desk = workspaces.find((w) => w.id === id)
    if (!desk) return
    const siblings = workspaces.filter((w) => (w.parent_id ?? null) === (desk.parent_id ?? null))
    const at = siblings.findIndex((w) => w.id === id)
    const target =
      key === 'up' ? siblings[at - 1] && { id: siblings[at - 1].id, mode: 'before' as const }
      : key === 'down' ? siblings[at + 1] && { id: siblings[at + 1].id, mode: 'after' as const }
      : key === 'in' ? siblings[at - 1] && { id: siblings[at - 1].id, mode: 'inside' as const }
      : desk.parent_id ? { id: desk.parent_id, mode: 'after' as const } : undefined
    const updates = target && planTreeDrop(workspaces, id, target.id, target.mode)
    if (!target || !updates) return
    if (target.mode === 'inside') setCollapsed((prev) => new Set([...prev].filter((c) => c !== target.id)))
    void reorderWorkspaces(updates).then(() => {
      // Keep keyboard focus on the moved desk's handle after the list re-renders.
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-desk-grip="${id}"]`)?.focus())
    })
  }

  const onDragEnd = (e: DragEndEvent): void => {
    setDropTarget(null)
    const target = dropOf(e)
    const updates = target && planTreeDrop(workspaces, String(e.active.id), target.id, target.mode)
    if (!updates || !target) return
    if (target.mode === 'inside') setCollapsed((prev) => new Set([...prev].filter((id) => id !== target.id)))
    reorderWorkspaces(updates)
  }

  return (
    <ResizablePane
      as="aside"
      id="sidebar"
      label="사이드바"
      min={200}
      max={420}
      fallback={240}
      maxShare={0.35}
      className="glass-chrome glass-pane group/sidebar flex flex-col"
    >
      {/* On macOS the traffic lights sit in the top-left, so the brand row starts below them. */}
      <div className={cn('drag-region flex shrink-0 items-center gap-2 px-3 pb-2', IS_MAC ? 'pt-9' : 'pt-3')}>
        {/* The app icon, trimmed of its dock padding so the tile fills the space. */}
        <img src="./app-icon.png" alt="" draggable={false} className="h-7 w-7 shrink-0 rounded-[7px] shadow-sm ring-1 ring-black/10 dark:ring-white/10" />
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight">AOP Note</span>
        <button
          onClick={toggleSidebar}
          title={`사이드바 접기 (${shortcut('Mod', '\\')})`}
          aria-label="사이드바 접기"
          className="no-drag flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/sidebar:opacity-100"
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>
      </div>

      <nav className="space-y-px px-2">
        <NavItem icon={Search} label="검색" hint={shortcut('Mod', 'P')} onClick={openPalette} />
        <NavItem icon={SquarePen} label="빠른 추가" hint={shortcut('Mod', 'N')} onClick={() => openQuickCapture()} />
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
          icon={CalendarDays}
          label="통합 달력"
          active={utilityView === 'calendar'}
          onClick={() => openUtility('calendar')}
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
        <NavItem
          icon={Wrench}
          label="도구"
          active={utilityView === 'tools'}
          onClick={() => openUtility('tools')}
        />
      </nav>

      <div className="group/section mt-5 flex items-center justify-between px-4 pb-1">
        <h2 className="text-xs font-medium text-muted-foreground">데스크</h2>
        <button
          onClick={() => setAdding(null)}
          title="새 데스크"
          aria-label="새 데스크"
          className="no-drag -mr-1 flex h-5 w-5 items-center justify-center rounded text-muted-foreground opacity-0 transition hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/section:opacity-100"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <nav className="flex-1 space-y-px overflow-y-auto px-2 pb-2">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragMove={(e) => setDropTarget(dropOf(e))}
          onDragEnd={onDragEnd}
          onDragCancel={() => setDropTarget(null)}
        >
          <SortableContext items={rows.map((r) => r.item.id)} strategy={noShift}>
            {rows.map(({ item: ws, depth, hasChildren }) => (
              <div key={ws.id}>
              <DeskRow
                ws={ws}
                depth={depth}
                collapsed={hasChildren ? collapsed.has(ws.id) : undefined}
                drop={dropTarget?.id === ws.id ? dropTarget.mode : undefined}
                onKeyMove={(key) => moveByKey(ws.id, key)}
                onToggle={() => toggle(ws.id)}
                onAddChild={() => startAddChild(ws.id)}
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
              {adding === ws.id && (
                <DeskNameInput
                  value={name}
                  depth={depth + 1}
                  placeholder="하위 데스크 이름"
                  onChange={setName}
                  onSubmit={submit}
                  onCancel={cancelAdd}
                />
              )}
              </div>
            ))}
          </SortableContext>
        </DndContext>

        {adding === null ? (
          <DeskNameInput value={name} depth={0} placeholder="데스크 이름" onChange={setName} onSubmit={submit} onCancel={cancelAdd} />
        ) : (
          <NavItem icon={Plus} label="새 데스크" muted onClick={() => setAdding(null)} />
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
    </ResizablePane>
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
        <kbd className="font-sans text-[11px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-has-[:focus-visible]:opacity-100">
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
      title={`사이드바 열기 (${shortcut('Mod', '\\')})`}
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

function DeskNameInput({
  value,
  depth,
  placeholder,
  onChange,
  onSubmit,
  onCancel
}: {
  value: string
  depth: number
  placeholder: string
  onChange: (v: string) => void
  onSubmit: () => void
  onCancel: () => void
}): JSX.Element {
  return (
    <div className="py-0.5 pr-1" style={{ paddingLeft: 4 + depth * INDENT_PX }}>
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onSubmit}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return // 한글 IME 조합 Enter 무시
          if (e.key === 'Enter') onSubmit()
          if (e.key === 'Escape') onCancel()
        }}
        placeholder={placeholder}
        className="no-drag h-[30px] w-full rounded-md border border-input bg-background/70 px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  )
}
