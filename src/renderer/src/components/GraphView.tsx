import { useEffect, useMemo, useRef, useState } from 'react'
import { Waypoints, Search, FolderGit2 } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { toastError } from '@/store/useToast'
import { createLayout, tickLayout, type Layout } from '@/lib/forceLayout'
import { cn } from '@/lib/utils'
import { PageHeader } from './PageHeader'
import type { GraphData, GraphNode } from '@shared/types'

const SETTLED = 0.02
const MIN_SCALE = 0.2
const MAX_SCALE = 4
const CLICK_SLOP = 4 // px of pointer travel still counted as a click
const FIT_MARGIN = 0.8 // share of the canvas the graph fills after the first fit

interface Prepared {
  nodes: GraphNode[]
  edges: [number, number][]
  neighbours: Set<number>[]
}

/** One entry of the project list beside the graph. */
interface ProjectEntry {
  id: string
  name: string
  color: string
  notes: number
  files: number
}

function projectEntries(data: GraphData): ProjectEntry[] {
  const byDesk = new Map<string, ProjectEntry>()
  for (const n of data.nodes) {
    if (!n.workspace_id || n.kind === 'ghost') continue
    const entry = byDesk.get(n.workspace_id) ?? {
      id: n.workspace_id,
      name: n.workspace_name ?? '',
      color: n.color,
      notes: 0,
      files: 0
    }
    if (n.kind === 'file') entry.files++
    else entry.notes++
    byDesk.set(n.workspace_id, entry)
  }
  return [...byDesk.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** Keep the nodes to show (one project, or all) and re-index edges onto them. */
function prepare(data: GraphData, linkedOnly: boolean, scope: string | null): Prepared {
  let scoped = data.nodes
  if (scope) {
    const own = new Set(data.nodes.filter((n) => n.workspace_id === scope).map((n) => n.id))
    // Unwritten notes this project links to belong to its picture too.
    const ghosts = new Set(
      data.edges.flatMap((e) =>
        own.has(e.source) && e.target.startsWith('ghost:') ? [e.target] : own.has(e.target) && e.source.startsWith('ghost:') ? [e.source] : []
      )
    )
    scoped = data.nodes.filter((n) => own.has(n.id) || ghosts.has(n.id))
  }
  const nodes = linkedOnly ? scoped.filter((n) => n.links > 0) : scoped
  const index = new Map(nodes.map((n, i) => [n.id, i]))
  const edges: [number, number][] = []
  const neighbours = nodes.map(() => new Set<number>())
  for (const e of data.edges) {
    const a = index.get(e.source)
    const b = index.get(e.target)
    if (a === undefined || b === undefined) continue
    edges.push([a, b])
    neighbours[a].add(b)
    neighbours[b].add(a)
  }
  return { nodes, edges, neighbours }
}

const radius = (n: GraphNode): number => 4 + Math.sqrt(n.links) * 2.2

export function GraphView(): JSX.Element {
  const [data, setData] = useState<GraphData | null>(null)
  const [linkedOnly, setLinkedOnly] = useState(true)
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<string | null>(null)
  const workspaces = useStore((s) => s.workspaces)
  // Linked folders changing on disk (docs edited, commits) can add or remove nodes.
  const projectVersion = useStore((s) => s.projectVersion)

  useEffect(() => {
    window.api.link.graph().then(setData, toastError)
  }, [projectVersion])

  const graph = useMemo(() => (data ? prepare(data, linkedOnly, scope) : null), [data, linkedOnly, scope])
  const entries = useMemo(() => (data ? projectEntries(data) : []), [data])
  const hasFolder = (id: string): boolean => Boolean(workspaces.find((w) => w.id === id)?.folder_path)

  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={Waypoints} title="그래프" count={graph?.nodes.length} />
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-5 py-2">
        <label className="flex h-8 w-64 items-center gap-2 rounded-md border border-input bg-background/60 px-2.5 focus-within:ring-2 focus-within:ring-ring">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="메모 찾아 강조"
            aria-label="그래프에서 메모 찾기"
            className="h-full min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
        </label>
        <button
          onClick={() => setLinkedOnly((v) => !v)}
          aria-pressed={linkedOnly}
          className={cn(
            'h-8 rounded-md px-2.5 text-xs transition-colors hover:bg-accent',
            linkedOnly ? 'text-foreground' : 'text-muted-foreground'
          )}
        >
          {linkedOnly ? '연결된 메모만' : '내용 있는 메모 모두'}
        </button>
        <p className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-muted-foreground" />
            메모
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 bg-muted-foreground" />
            프로젝트 문서
          </span>
          <span>클릭해서 열기 · 드래그로 이동 · 스크롤로 확대</span>
        </p>
      </div>

      <div className="flex min-h-0 flex-1">
        <nav aria-label="프로젝트" className="w-56 shrink-0 overflow-y-auto border-r border-border p-2">
          <p className="px-2 pb-1 pt-1 text-xs font-medium text-muted-foreground">프로젝트</p>
          <ScopeItem
            label="전체"
            detail={data ? `${data.nodes.filter((n) => n.kind !== 'ghost').length}개` : ''}
            active={scope === null}
            onClick={() => setScope(null)}
          />
          {entries.map((e) => (
            <ScopeItem
              key={e.id}
              label={e.name}
              color={e.color}
              linked={hasFolder(e.id)}
              detail={`메모 ${e.notes}${e.files ? ` · 문서 ${e.files}` : ''}`}
              active={scope === e.id}
              onClick={() => setScope(e.id)}
            />
          ))}
        </nav>
        <div className="flex min-w-0 flex-1 flex-col">
          {graph && graph.nodes.length === 0 ? (
            <div className="m-auto max-w-sm px-6 text-center text-sm text-muted-foreground">
              <Waypoints className="mx-auto mb-3 h-8 w-8 opacity-40" />
              아직 연결된 메모가 없습니다. 메모에서 <code className="rounded bg-muted px-1">[[</code>를 입력해
              다른 메모를 링크하면 여기에 지식 그래프가 그려집니다.
            </div>
          ) : (
            graph && <GraphCanvas graph={graph} query={query} />
          )}
        </div>
      </div>
    </div>
  )
}

interface ScopeItemProps {
  label: string
  detail: string
  active: boolean
  color?: string
  /** The desk has a linked project folder. */
  linked?: boolean
  onClick: () => void
}

function ScopeItem({ label, detail, active, color, linked, onClick }: ScopeItemProps): JSX.Element {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
        active ? 'bg-accent text-foreground' : 'text-foreground/80 hover:bg-accent/60'
      )}
    >
      {color ? (
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      ) : (
        <Waypoints className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 truncate text-sm font-medium">
          <span className="truncate">{label}</span>
          {linked && <FolderGit2 className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="폴더 연결됨" />}
        </span>
        <span className="block truncate text-[11px] text-muted-foreground">{detail}</span>
      </span>
    </button>
  )
}

function GraphCanvas({ graph, query }: { graph: Prepared; query: string }): JSX.Element {
  const openNote = useStore((s) => s.openNote)
  const previewFile = useStore((s) => s.previewFile)
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  // Mutable per-frame state lives in refs so the animation loop doesn't re-render React.
  const layout = useMemo<Layout>(() => createLayout(graph.nodes.length, graph.edges), [graph])
  const view = useRef({ scale: 1, tx: 0, ty: 0 })
  const hoverRef = useRef<number | null>(null)
  const kickRef = useRef<() => void>(() => undefined)
  const drag = useRef<{
    node: number | null
    startX: number
    startY: number
    lastX: number
    lastY: number
    moved: boolean
  } | null>(null)
  hoverRef.current = hover

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? new Set(graph.nodes.flatMap((n, i) => (n.title.toLowerCase().includes(q) ? [i] : []))) : null
  }, [graph, query])
  const matchesRef = useRef(matches)
  matchesRef.current = matches

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !wrap || !ctx) return
    let frame = 0
    let running = false

    const color = (name: string, alpha = 1): string => {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
      return `hsl(${v} / ${alpha})`
    }

    const draw = (): void => {
      const dpr = window.devicePixelRatio || 1
      const { width, height } = canvas
      const { scale, tx, ty } = view.current
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, width, height)
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, width / 2 + dpr * tx, height / 2 + dpr * ty)

      const focus = hoverRef.current
      const lit = (i: number): boolean =>
        focus === null ? (matchesRef.current ? matchesRef.current.has(i) : true) : i === focus || graph.neighbours[focus].has(i)

      ctx.lineWidth = 1 / scale
      for (const [a, b] of graph.edges) {
        const on = focus !== null && (a === focus || b === focus)
        ctx.strokeStyle = on ? color('--primary', 0.7) : color('--foreground', lit(a) && lit(b) ? 0.16 : 0.05)
        ctx.beginPath()
        ctx.moveTo(layout.x[a], layout.y[a])
        ctx.lineTo(layout.x[b], layout.y[b])
        ctx.stroke()
      }

      const fontSize = 11 / scale
      ctx.font = `${fontSize}px 'Pretendard Variable', sans-serif`
      ctx.textAlign = 'center'
      graph.nodes.forEach((n, i) => {
        const r = radius(n)
        ctx.globalAlpha = lit(i) ? 1 : 0.15
        ctx.beginPath()
        // Project documents are squares, notes circles — the two halves of the brain.
        if (n.kind === 'file') ctx.rect(layout.x[i] - r, layout.y[i] - r, r * 2, r * 2)
        else ctx.arc(layout.x[i], layout.y[i], r, 0, Math.PI * 2)
        if (n.kind === 'ghost') {
          ctx.strokeStyle = color('--muted-foreground', 0.8)
          ctx.setLineDash([2 / scale, 2 / scale])
          ctx.stroke()
          ctx.setLineDash([])
        } else {
          ctx.fillStyle = n.color
          ctx.fill()
        }
        if (i === focus || matchesRef.current?.has(i)) {
          ctx.strokeStyle = color('--primary')
          ctx.lineWidth = 2 / scale
          ctx.stroke()
          ctx.lineWidth = 1 / scale
        }
        // Labels only when zoomed in enough to read, or for the focused neighbourhood.
        if (scale > 0.9 || (focus !== null && lit(i))) {
          ctx.fillStyle = color(n.kind === 'ghost' ? '--muted-foreground' : '--foreground', lit(i) ? 0.9 : 0.3)
          ctx.fillText(n.title, layout.x[i], layout.y[i] + r + fontSize + 2 / scale)
        }
      })
      ctx.globalAlpha = 1
    }

    // Once the first layout settles, zoom so the whole graph fills the view.
    let fitted = false
    const fit = (): void => {
      if (layout.x.length === 0) return
      const rect = wrap.getBoundingClientRect()
      const [minX, maxX] = [Math.min(...layout.x) - 40, Math.max(...layout.x) + 40]
      const [minY, maxY] = [Math.min(...layout.y) - 40, Math.max(...layout.y) + 40]
      const scale = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, FIT_MARGIN * Math.min(rect.width / (maxX - minX), rect.height / (maxY - minY)))
      )
      view.current = { scale, tx: (-(minX + maxX) / 2) * scale, ty: (-(minY + maxY) / 2) * scale }
    }

    const loop = (): void => {
      const energy = tickLayout(layout)
      if (!fitted && energy <= SETTLED * 5) {
        fitted = true
        fit()
      }
      draw()
      if (energy > SETTLED || drag.current) {
        frame = requestAnimationFrame(loop)
      } else {
        running = false
      }
    }
    const kick = (): void => {
      if (running) return
      running = true
      frame = requestAnimationFrame(loop)
    }
    kickRef.current = () => {
      draw()
      kick()
    }

    const resize = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1
      const rect = wrap.getBoundingClientRect()
      canvas.width = Math.max(1, Math.round(rect.width * dpr))
      canvas.height = Math.max(1, Math.round(rect.height * dpr))
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
      draw()
    })
    resize.observe(wrap)
    kick()

    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
    }
  }, [graph, layout])

  // Redraw on hover / search changes (the loop may be idle).
  useEffect(() => kickRef.current(), [hover, matches])

  // ---- pointer interaction ----
  const toWorld = (e: React.PointerEvent | React.WheelEvent): [number, number] => {
    const rect = canvasRef.current?.getBoundingClientRect()
    const { scale, tx, ty } = view.current
    if (!rect) return [0, 0]
    return [
      (e.clientX - rect.left - rect.width / 2 - tx) / scale,
      (e.clientY - rect.top - rect.height / 2 - ty) / scale
    ]
  }

  const nodeAt = (wx: number, wy: number): number | null => {
    let best: number | null = null
    let bestD = Infinity
    graph.nodes.forEach((n, i) => {
      const d = Math.hypot(layout.x[i] - wx, layout.y[i] - wy)
      if (d < radius(n) + 4 / view.current.scale && d < bestD) {
        best = i
        bestD = d
      }
    })
    return best
  }

  const onPointerDown = (e: React.PointerEvent): void => {
    e.currentTarget.setPointerCapture(e.pointerId)
    const node = nodeAt(...toWorld(e))
    if (node !== null) layout.pinned[node] = true
    drag.current = { node, startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY, moved: false }
  }

  const onPointerMove = (e: React.PointerEvent): void => {
    const d = drag.current
    if (!d) {
      setHover(nodeAt(...toWorld(e)))
      return
    }
    if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > CLICK_SLOP) d.moved = true
    if (d.node !== null) {
      const [wx, wy] = toWorld(e)
      layout.x[d.node] = wx
      layout.y[d.node] = wy
    } else {
      view.current = {
        ...view.current,
        tx: view.current.tx + e.clientX - d.lastX,
        ty: view.current.ty + e.clientY - d.lastY
      }
    }
    d.lastX = e.clientX
    d.lastY = e.clientY
    kickRef.current()
  }

  const onPointerUp = (): void => {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (d.node !== null) layout.pinned[d.node] = false
    const n = d.node !== null ? graph.nodes[d.node] : null
    if (!d.moved && n?.kind === 'note' && n.workspace_id && n.category_id) {
      void openNote({ id: n.id, workspace_id: n.workspace_id, category_id: n.category_id })
    }
    if (!d.moved && n?.kind === 'file' && n.workspace_id && n.path) previewFile(n.workspace_id, n.path)
    kickRef.current()
  }

  const onWheel = (e: React.WheelEvent): void => {
    const { scale, tx, ty } = view.current
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * Math.exp(-e.deltaY * 0.0015)))
    const [wx, wy] = toWorld(e)
    // Keep the point under the cursor fixed while zooming.
    view.current = { scale: next, tx: tx + wx * (scale - next), ty: ty + wy * (scale - next) }
    kickRef.current()
  }

  const hovered = hover !== null ? graph.nodes[hover] : null

  return (
    <div ref={wrapRef} className="relative min-h-0 flex-1 overflow-hidden">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`메모 ${graph.nodes.length}개, 링크 ${graph.edges.length}개의 그래프`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => !drag.current && setHover(null)}
        onWheel={onWheel}
        className={cn('block touch-none', hovered && hovered.kind !== 'ghost' ? 'cursor-pointer' : 'cursor-grab')}
      />
      {hovered && (
        <div className="glass-overlay pointer-events-none absolute left-4 top-4 max-w-xs rounded-lg px-3 py-2 text-xs">
          <p className="truncate text-sm font-medium">{hovered.title}</p>
          <p className="mt-0.5 text-muted-foreground">
            {hovered.kind === 'ghost'
              ? '아직 없는 메모 — 링크한 메모에서 ⌘+클릭하면 만들어집니다'
              : hovered.kind === 'file'
                ? `${hovered.workspace_name} 프로젝트 · ${hovered.path} · 연결 ${hovered.links}개`
                : `${hovered.workspace_name} · 연결 ${hovered.links}개`}
          </p>
        </div>
      )}
    </div>
  )
}
