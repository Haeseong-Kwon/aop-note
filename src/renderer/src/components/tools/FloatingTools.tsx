import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { Maximize2, Minimize2, PanelsTopLeft, RotateCcw, Wrench, X } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { useToast } from '@/store/useToast'
import { cn } from '@/lib/utils'
import { GROUPS, GROUP_ORDER, TOOLS, clearToolInputs, findTool, matchesTool, pushRecent, readRecent, toolVars, writeActiveTool, type Tool } from './registry'

const WIDE_KEY = 'aop-tools-float-wide'
const EDGE = 12 // px the panel keeps from the window edges while dragged

const readWide = (): boolean => {
  try {
    return localStorage.getItem(WIDE_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * The tools button in the bottom-right corner: quiet until hovered, opens a tool list
 * from itself, and runs the chosen tool in a floating panel over whatever view is open.
 */
export function FloatingTools(): JSX.Element | null {
  const utilityView = useStore((s) => s.utilityView)
  const openUtility = useStore((s) => s.openUtility)
  const [menuOpen, setMenuOpen] = useState(false)
  const [toolId, setToolId] = useState<string | null>(null)
  const fabRef = useRef<HTMLButtonElement>(null)
  const onToolsPage = utilityView === 'tools'

  // The 도구 page shows the same tools full-size; don't stack a second copy over it.
  useEffect(() => {
    if (onToolsPage) {
      setMenuOpen(false)
      setToolId(null)
    }
  }, [onToolsPage])

  if (onToolsPage) return null
  const tool = findTool(toolId)

  const pick = (id: string): void => {
    pushRecent(id)
    setToolId(id)
    setMenuOpen(false)
  }
  const openFull = (id: string): void => {
    writeActiveTool(id)
    pushRecent(id)
    openUtility('tools')
  }

  return (
    <>
      {tool && <ToolPanel key={tool.id} tool={tool} onClose={() => setToolId(null)} onOpenFull={() => openFull(tool.id)} />}
      {menuOpen && <ToolMenu activeId={toolId} onPick={pick} onClose={() => setMenuOpen(false)} fabRef={fabRef} />}
      <button
        ref={fabRef}
        onClick={() => setMenuOpen((o) => !o)}
        aria-label="도구 열기"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        title="도구"
        className={cn(
          'tool-fab no-drag fixed bottom-4 right-4 z-[45] flex h-10 w-10 items-center justify-center rounded-full text-foreground/80',
          (menuOpen || tool) && 'is-active'
        )}
      >
        <Wrench className={cn('absolute h-[17px] w-[17px] transition-all duration-200', menuOpen ? 'rotate-90 scale-50 opacity-0' : 'rotate-0 scale-100 opacity-100')} />
        <X className={cn('absolute h-[17px] w-[17px] transition-all duration-200', menuOpen ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-50 opacity-0')} />
      </button>
    </>
  )
}

function ToolMenu({ activeId, onPick, onClose, fabRef }: { activeId: string | null; onPick: (id: string) => void; onClose: () => void; fabRef: React.RefObject<HTMLButtonElement> }): JSX.Element {
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const menuRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Close on a click anywhere else (the FAB toggles itself).
  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node
      if (!menuRef.current?.contains(t) && !fabRef.current?.contains(t)) onClose()
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [onClose, fabRef])

  const q = query.trim().toLowerCase()
  const recent = q ? [] : readRecent().slice(0, 4).map(findTool).filter((t): t is Tool => Boolean(t))
  // Searching: one list, tools whose name matches first (so '부가' opens 부가세, not 견적 합계).
  const rank = (t: Tool): number => (t.name.toLowerCase().startsWith(q) ? 0 : t.name.toLowerCase().includes(q) ? 1 : 2)
  const sections = (
    q
      ? [{ key: 'results', title: '검색 결과', color: null as string | null, tools: TOOLS.filter((t) => matchesTool(t, q)).sort((a, b) => rank(a) - rank(b)) }]
      : [
          ...(recent.length ? [{ key: 'recent', title: '최근 사용', color: null as string | null, tools: recent }] : []),
          ...GROUP_ORDER.map((g) => ({ key: g, title: GROUPS[g].name, color: GROUPS[g].color as string | null, tools: TOOLS.filter((t) => t.group === g) }))
        ]
  ).filter((s) => s.tools.length > 0)
  const flat = sections.flatMap((s) => s.tools.map((t) => ({ tool: t, key: `${s.key}:${t.id}` })))
  const current = Math.min(cursor, Math.max(0, flat.length - 1))

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-cursor="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [current])

  const onKey = (e: KeyboardEvent): void => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => (Math.min(c, flat.length - 1) + (e.key === 'ArrowDown' ? 1 : -1) + flat.length) % Math.max(1, flat.length))
    } else if (e.key === 'Enter' && flat[current]) {
      e.preventDefault()
      onPick(flat[current].tool.id)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onClose()
      fabRef.current?.focus()
    }
  }

  let index = -1
  return (
    <div ref={menuRef} role="menu" aria-label="도구" onKeyDown={onKey} className="tool-float-surface fixed bottom-[3.75rem] right-4 z-[46] flex max-h-[min(32rem,calc(100vh-6rem))] w-[19.5rem] origin-bottom-right animate-tool-menu-in flex-col overflow-hidden rounded-2xl">
      <div className="border-b border-border/70 p-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setCursor(0)
          }}
          placeholder="도구 찾기"
          aria-label="도구 찾기"
          className="h-9 w-full rounded-lg bg-muted/60 px-3 text-[13px] outline-none placeholder:text-muted-foreground/70 focus:bg-muted"
        />
      </div>
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
        {flat.length === 0 && <p className="px-3 py-6 text-center text-[12.5px] text-muted-foreground">‘{query}’에 맞는 도구가 없습니다.</p>}
        {sections.map((s) => (
          <section key={s.key} className="mb-1 last:mb-0">
            <h3 className="flex items-center gap-1.5 px-2.5 pb-1 pt-2 text-[11px] font-medium text-muted-foreground">
              {s.color && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.color }} />}
              {s.title}
            </h3>
            {s.tools.map((t) => {
              index++
              const i = index
              const on = i === current
              return (
                <button
                  key={`${s.key}:${t.id}`}
                  role="menuitem"
                  data-cursor={on}
                  onMouseMove={() => setCursor(i)}
                  onClick={() => onPick(t.id)}
                  style={toolVars(t.group)}
                  className={cn('flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors duration-75', on && 'bg-accent')}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[color:var(--tool-soft)] text-[color:var(--tool)]">
                    <t.icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{t.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{t.blurb}</span>
                  </span>
                  {t.id === activeId && <span className="shrink-0 rounded bg-muted px-1.5 text-[10px] text-muted-foreground">열림</span>}
                </button>
              )
            })}
          </section>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-border/70 px-3 py-1.5 text-[10.5px] text-muted-foreground">
        <span>↑↓ 이동 · Enter 열기 · Esc 닫기</span>
        <span>{TOOLS.length}개</span>
      </div>
    </div>
  )
}

function ToolPanel({ tool, onClose, onOpenFull }: { tool: Tool; onClose: () => void; onOpenFull: () => void }): JSX.Element {
  const [version, setVersion] = useState(0)
  const [wide, setWideState] = useState(readWide)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const panelRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ px: number; py: number; ox: number; oy: number; rect: DOMRect } | null>(null)
  const show = useToast((s) => s.show)

  const setWide = (w: boolean): void => {
    setWideState(w)
    setOffset({ x: 0, y: 0 })
    try {
      localStorage.setItem(WIDE_KEY, w ? '1' : '0')
    } catch {
      /* not remembered */
    }
  }

  // Drag by the header; the panel stays inside the window.
  const onPointerDown = (e: ReactPointerEvent<HTMLElement>): void => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button') || !panelRef.current) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y, rect: panelRef.current.getBoundingClientRect() }
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLElement>): void => {
    const d = drag.current
    if (!d) return
    const dx = Math.min(window.innerWidth - EDGE - d.rect.right, Math.max(EDGE - d.rect.left, e.clientX - d.px))
    const dy = Math.min(window.innerHeight - EDGE - d.rect.bottom, Math.max(EDGE - d.rect.top, e.clientY - d.py))
    setOffset({ x: d.ox + dx, y: d.oy + dy })
  }
  const endDrag = (): void => {
    drag.current = null
  }

  const reset = (): void => {
    clearToolInputs(tool.id)
    setVersion((v) => v + 1)
    show({ message: `${tool.name} 입력값을 지웠습니다.` })
  }

  const G = GROUPS[tool.group]
  const iconButton = 'flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'
  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={tool.name}
      style={{ ...toolVars(tool.group), transform: `translate(${offset.x}px, ${offset.y}px)` }}
      className={cn(
        'tool-float-surface fixed bottom-[3.75rem] right-4 z-[44] flex max-h-[calc(100vh-5.5rem)] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl',
        wide ? 'w-[56rem]' : 'w-[28rem]'
      )}
    >
      <div className="animate-tool-panel-in flex min-h-0 flex-1 flex-col">
        <header
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={() => setOffset({ x: 0, y: 0 })}
          title="끌어서 옮기기 · 두 번 클릭하면 제자리"
          className="flex shrink-0 cursor-grab select-none items-center gap-2.5 border-b border-border/70 py-2 pl-3 pr-2 active:cursor-grabbing"
        >
          <span className="tool-badge flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
            <tool.icon className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <h2 className="truncate text-[13.5px] font-semibold tracking-[-0.01em]">{tool.name}</h2>
            <p className="truncate text-[11px] text-muted-foreground">{G.name}</p>
          </div>
          <button onClick={reset} className={iconButton} title="입력값 초기화" aria-label="입력값 초기화">
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setWide(!wide)} className={iconButton} title={wide ? '좁게 보기' : '넓게 보기'} aria-label={wide ? '좁게 보기' : '넓게 보기'}>
            {wide ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          <button onClick={onOpenFull} className={iconButton} title="도구 화면에서 열기" aria-label="도구 화면에서 열기">
            <PanelsTopLeft className="h-3.5 w-3.5" />
          </button>
          <button onClick={onClose} className={iconButton} title="닫기" aria-label="닫기">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="cq min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 pt-4">
          <tool.Component key={version} />
        </div>
      </div>
    </div>
  )
}
