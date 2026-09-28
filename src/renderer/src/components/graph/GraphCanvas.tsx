import { useEffect, useMemo, useRef, useState } from 'react'
import { Maximize, SlidersHorizontal } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { createLayout, tickLayout, type Layout } from '@/lib/forceLayout'
import { labelAlphaFor, nodeRadius, type GraphSettings } from '@/lib/graphStyle'
import { cn, MOD_CLICK } from '@/lib/utils'
import type { GraphNode } from '@shared/types'
import { GraphSettingsPanel } from './GraphSettingsPanel'
import { DocumentViewer } from '../DocumentViewer'

export interface PreparedGraph {
  nodes: GraphNode[]
  edges: [number, number][]
  neighbours: Set<number>[]
}

const SETTLED = 0.02
const MIN_SCALE = 0.15
const MAX_SCALE = 5
const CLICK_SLOP = 4 // px of pointer travel still counted as a click
const FIT_MARGIN = 0.8 // share of the canvas the graph fills after a fit
const FADE_SPEED = 0.2 // share of the remaining highlight transition per frame
const DIM = 0.1 // opacity of everything outside the highlighted neighbourhood
const LABEL_PX = 12
// Desks and categories anchor the picture: drawn larger, labelled at lower zoom.
const KIND_SCALE: Partial<Record<GraphNode['kind'], number>> = { desk: 1.9, category: 1.3, ghost: 0.8 }
const LABEL_BOOST: Partial<Record<GraphNode['kind'], number>> = { desk: 40, category: 8 }
const FLY_SPEED = 0.18 // share of the remaining pan/zoom per frame when flying to a search hit
const FOCUS_SCALE = 1.6

interface Palette {
  /** Dark mode: nodes and links glow (additive halos, bright cores). */
  glow: boolean
  note: string
  file: string
  folder: string
  desk: string
  ghost: string
  link: string
  accent: string
  text: string
  halo: string
}

/** Obsidian-like neutrals from the current theme (read each frame: the theme can flip live). */
function palette(): Palette {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string): string => css.getPropertyValue(name).trim()
  const dark = document.documentElement.classList.contains('dark')
  return {
    glow: dark,
    // Dark: phosphor tones that read as light sources; light: Obsidian's quiet neutrals.
    note: dark ? 'hsl(190 90% 72%)' : 'hsl(228 8% 46%)',
    file: dark ? 'hsl(40 100% 64%)' : 'hsl(32 85% 46%)',
    folder: dark ? 'hsl(150 75% 60%)' : 'hsl(150 50% 36%)',
    desk: dark ? 'hsl(335 90% 72%)' : 'hsl(335 70% 50%)',
    ghost: `hsl(${v('--muted-foreground')})`,
    link: dark ? 'hsl(195 80% 70% / 0.16)' : 'hsl(228 10% 40% / 0.22)',
    accent: dark ? 'hsl(275 95% 75%)' : `hsl(${v('--primary')})`,
    text: `hsl(${v('--foreground')})`,
    halo: `hsl(${v('--background')})`
  }
}

interface GraphCanvasProps {
  graph: PreparedGraph
  /** Search hits (node indexes), or null when not searching. */
  matches: Set<number> | null
  /** Fly to this node (seq changes on every request, so the same node can be asked twice). */
  focus: { index: number; seq: number } | null
  settings: GraphSettings
  onSettingsChange: (next: GraphSettings) => void
}

export function GraphCanvas({ graph, matches, focus: focusRequest, settings, onSettingsChange }: GraphCanvasProps): JSX.Element {
  const openNote = useStore((s) => s.openNote)
  const previewFile = useStore((s) => s.previewFile)
  const selectWorkspace = useStore((s) => s.selectWorkspace)
  const selectCategory = useStore((s) => s.selectCategory)
  const setMainView = useStore((s) => s.setMainView)
  const [viewing, setViewing] = useState<{ id: string; name: string } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  // Mutable per-frame state lives in refs so the animation loop doesn't re-render React.
  const layout = useMemo<Layout>(() => createLayout(graph.nodes.length, graph.edges), [graph])
  const view = useRef({ scale: 1, tx: 0, ty: 0 })
  const hoverRef = useRef<number | null>(null)
  const settingsRef = useRef(settings)
  const kickRef = useRef<() => void>(() => undefined)
  const fitRef = useRef<() => void>(() => undefined)
  const drag = useRef<{ node: number | null; startX: number; startY: number; lastX: number; lastY: number; moved: boolean } | null>(null)
  hoverRef.current = hover
  settingsRef.current = settings

  // The user has panned / zoomed / dragged: stop auto-fitting the view.
  const userMoved = useRef(false)
  // Where the view is easing to after a search pick (null = user in control).
  const viewTarget = useRef<{ scale: number; tx: number; ty: number } | null>(null)
  const matchesRef = useRef(matches)
  matchesRef.current = matches

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !wrap || !ctx) return
    let frame = 0
    let running = false
    userMoved.current = false // a new graph (e.g. another desk) starts fitted
    // Highlight transition: 0 = everything at rest, 1 = focus neighbourhood lit, rest dimmed.
    let fade = 0
    let shownFocus: number | null = null

    const draw = (): void => {
      const s = settingsRef.current
      const p = palette()
      const dpr = window.devicePixelRatio || 1
      const { width, height } = canvas
      const { scale, tx, ty } = view.current
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, width, height)
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, width / 2 + dpr * tx, height / 2 + dpr * ty)

      const focus = shownFocus
      const search = matchesRef.current
      const inFocus = (i: number): boolean => focus !== null && (i === focus || graph.neighbours[focus].has(i))
      // Search hits stay lit even while another node is hovered.
      const lit = (i: number): boolean => (focus !== null ? inFocus(i) || Boolean(search?.has(i)) : search ? search.has(i) : true)
      // Opacity for something outside the highlight, easing with the transition.
      const rest = (i: number): number => (lit(i) ? 1 : 1 - (1 - DIM) * fade)

      // Links: hairlines; the focused node's links take the accent colour. In dark mode
      // they glow: drawn additively with a soft blur so crossings brighten like light.
      const px = 1 / scale
      ctx.globalCompositeOperation = p.glow ? 'lighter' : 'source-over'
      for (const [a, b] of graph.edges) {
        const hot = focus !== null && (a === focus || b === focus)
        ctx.globalAlpha = hot ? 1 : Math.min(rest(a), rest(b))
        ctx.strokeStyle = hot ? p.accent : p.link
        ctx.lineWidth = s.linkWidth * px * (hot ? 1 + 0.8 * fade : 1)
        ctx.shadowColor = hot ? p.accent : 'transparent'
        ctx.shadowBlur = p.glow && hot ? 10 * dpr * fade : 0
        ctx.beginPath()
        ctx.moveTo(layout.x[a], layout.y[a])
        ctx.lineTo(layout.x[b], layout.y[b])
        ctx.stroke()
      }
      ctx.shadowBlur = 0

      const fillOf = (n: GraphNode, i: number, hot: boolean): string =>
        hot || (inFocus(i) && fade > 0.5)
          ? p.accent
          : n.kind === 'file'
            ? p.file
            : n.kind === 'folder' || n.kind === 'category'
              ? p.folder
              : n.kind === 'desk'
                ? p.desk
              : s.deskColors
                ? n.color
                : p.note
      const radiusOf = (n: GraphNode, hot: boolean): number =>
        nodeRadius(n.links, s.nodeSize) * (KIND_SCALE[n.kind] ?? 1) * (hot ? 1 + 0.25 * fade : 1)
      const isHot = (i: number): boolean => i === focus || Boolean(search?.has(i))

      // Dark: a coloured halo per node, added together so clusters bloom.
      if (p.glow) {
        graph.nodes.forEach((n, i) => {
          if (n.kind === 'ghost') return
          const hot = isHot(i)
          const r = radiusOf(n, hot)
          const reach = r * (hot ? 6 + 2 * fade : 5)
          const halo = ctx.createRadialGradient(layout.x[i], layout.y[i], r * 0.5, layout.x[i], layout.y[i], reach)
          halo.addColorStop(0, fillOf(n, i, hot))
          halo.addColorStop(1, 'transparent')
          ctx.globalAlpha = rest(i) * (hot ? 0.6 : 0.4)
          ctx.fillStyle = halo
          ctx.beginPath()
          ctx.arc(layout.x[i], layout.y[i], reach, 0, Math.PI * 2)
          ctx.fill()
        })
      }
      ctx.globalCompositeOperation = 'source-over'

      // Nodes: round, sized by connections; files amber, unwritten notes hollow.
      graph.nodes.forEach((n, i) => {
        const hot = isHot(i)
        const r = radiusOf(n, hot)
        ctx.globalAlpha = rest(i)
        ctx.beginPath()
        ctx.arc(layout.x[i], layout.y[i], r, 0, Math.PI * 2)
        if (n.kind === 'ghost') {
          ctx.strokeStyle = p.ghost
          ctx.lineWidth = 1.2 * px
          ctx.stroke()
        } else {
          ctx.fillStyle = fillOf(n, i, hot)
          ctx.fill()
          if (p.glow) {
            // A white-hot core: what makes a dot read as a light, not a disc.
            const core = ctx.createRadialGradient(layout.x[i], layout.y[i], 0, layout.x[i], layout.y[i], r)
            core.addColorStop(0, 'rgba(255,255,255,0.9)')
            core.addColorStop(0.55, 'rgba(255,255,255,0.15)')
            core.addColorStop(1, 'rgba(255,255,255,0)')
            ctx.fillStyle = core
            ctx.fill()
          }
        }
        if (hot) {
          ctx.globalAlpha = fade
          ctx.strokeStyle = p.accent
          ctx.lineWidth = 2 * px
          ctx.beginPath()
          ctx.arc(layout.x[i], layout.y[i], r + 3 * px, 0, Math.PI * 2)
          ctx.stroke()
        }
      })

      // Labels last, so no node paints over text. They fade in with zoom; the focused
      // neighbourhood always shows its labels.
      const fontSize = LABEL_PX * px
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.lineJoin = 'round'
      graph.nodes.forEach((n, i) => {
        const alpha = Math.max(labelAlphaFor(scale, s.textFade, n.links + (LABEL_BOOST[n.kind] ?? 0)), inFocus(i) ? fade : 0, search?.has(i) ? 1 : 0) * rest(i)
        if (alpha < 0.02) return
        const r = nodeRadius(n.links, s.nodeSize) * (KIND_SCALE[n.kind] ?? 1)
        const y = layout.y[i] + r + 4 * px
        ctx.font = `${i === focus ? 600 : 400} ${fontSize}px 'Pretendard Variable', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`
        ctx.globalAlpha = alpha
        ctx.strokeStyle = p.halo
        ctx.lineWidth = 3 * px
        ctx.strokeText(n.title, layout.x[i], y)
        ctx.fillStyle = n.kind === 'ghost' ? p.ghost : p.text
        ctx.shadowColor = p.glow && inFocus(i) ? p.accent : 'transparent'
        ctx.shadowBlur = p.glow && inFocus(i) ? 6 * dpr * fade : 0
        ctx.fillText(n.title, layout.x[i], y)
        ctx.shadowBlur = 0
      })
      ctx.globalAlpha = 1
    }

    // Zoom so the whole graph fills the view — and keep doing so while a big layout is
    // still spreading out, until the user pans, zooms or drags (then the view is theirs).
    const fit = (): void => {
      if (layout.x.length === 0) return
      const rect = wrap.getBoundingClientRect()
      const [minX, maxX] = [Math.min(...layout.x) - 40, Math.max(...layout.x) + 40]
      const [minY, maxY] = [Math.min(...layout.y) - 40, Math.max(...layout.y) + 40]
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, FIT_MARGIN * Math.min(rect.width / (maxX - minX), rect.height / (maxY - minY))))
      view.current = { scale, tx: (-(minX + maxX) / 2) * scale, ty: (-(minY + maxY) / 2) * scale }
    }

    const loop = (): void => {
      const energy = tickLayout(layout, settingsRef.current)
      if (!userMoved.current) fit()
      // Glide toward a searched node.
      const goal = viewTarget.current
      if (goal) {
        const v = view.current
        view.current = { scale: v.scale + (goal.scale - v.scale) * FLY_SPEED, tx: v.tx + (goal.tx - v.tx) * FLY_SPEED, ty: v.ty + (goal.ty - v.ty) * FLY_SPEED }
        if (Math.abs(goal.tx - v.tx) + Math.abs(goal.ty - v.ty) < 0.5 && Math.abs(goal.scale - v.scale) < 0.005) viewTarget.current = null
      }
      // Ease the highlight toward the current hover / search state.
      const target = hoverRef.current !== null || matchesRef.current ? 1 : 0
      if (hoverRef.current !== null) shownFocus = hoverRef.current
      fade += (target - fade) * FADE_SPEED
      if (Math.abs(target - fade) < 0.01) fade = target
      if (fade === 0) shownFocus = null
      draw()
      if (energy > SETTLED || drag.current || fade !== target || viewTarget.current) {
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
    kickRef.current = kick
    fitRef.current = () => {
      userMoved.current = false
      fit()
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
    // Colours come from the theme: repaint when <html class="dark"> flips.
    const themeWatch = new MutationObserver(() => draw())
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    kick()

    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      themeWatch.disconnect()
    }
  }, [graph, layout])

  // Hover / search / settings changes: the loop may be idle, so wake it.
  useEffect(() => kickRef.current(), [hover, matches, settings])

  // A search pick: fly to the node, zoomed in enough to read, and light up its neighbourhood.
  useEffect(() => {
    if (!focusRequest || focusRequest.index >= graph.nodes.length) return
    const i = focusRequest.index
    const scale = Math.max(view.current.scale, FOCUS_SCALE)
    userMoved.current = true
    viewTarget.current = { scale, tx: -layout.x[i] * scale, ty: -layout.y[i] * scale }
    setHover(i)
    kickRef.current()
  }, [focusRequest, graph, layout])

  // ---- pointer interaction ----
  const toWorld = (e: React.PointerEvent | React.WheelEvent): [number, number] => {
    const rect = canvasRef.current?.getBoundingClientRect()
    const { scale, tx, ty } = view.current
    if (!rect) return [0, 0]
    return [(e.clientX - rect.left - rect.width / 2 - tx) / scale, (e.clientY - rect.top - rect.height / 2 - ty) / scale]
  }

  const nodeAt = (wx: number, wy: number): number | null => {
    let best: number | null = null
    let bestD = Infinity
    graph.nodes.forEach((n, i) => {
      const d = Math.hypot(layout.x[i] - wx, layout.y[i] - wy)
      if (d < nodeRadius(n.links, settings.nodeSize) * (KIND_SCALE[n.kind] ?? 1) + 5 / view.current.scale && d < bestD) {
        best = i
        bestD = d
      }
    })
    return best
  }

  const onPointerDown = (e: React.PointerEvent): void => {
    viewTarget.current = null
    userMoved.current = true
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
      view.current = { ...view.current, tx: view.current.tx + e.clientX - d.lastX, ty: view.current.ty + e.clientY - d.lastY }
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
    if (!d.moved && n?.attachment_id) setViewing({ id: n.attachment_id, name: n.title })
    else if (!d.moved && n?.kind === 'file' && n.workspace_id && n.path) previewFile(n.workspace_id, n.path)
    if (!d.moved && n?.kind === 'desk' && n.workspace_id) void selectWorkspace(n.workspace_id)
    if (!d.moved && n?.kind === 'category' && n.workspace_id && n.category_id) {
      const categoryId = n.category_id
      void selectWorkspace(n.workspace_id).then(() => {
        setMainView('tasks')
        selectCategory(categoryId)
      })
    }
    kickRef.current()
  }

  const onWheel = (e: React.WheelEvent): void => {
    viewTarget.current = null
    userMoved.current = true
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
        className={cn('block touch-none', hovered && hovered.kind !== 'ghost' && hovered.kind !== 'folder' ? 'cursor-pointer' : 'cursor-grab')}
      />
      {viewing && <DocumentViewer attachmentId={viewing.id} fileName={viewing.name} onClose={() => setViewing(null)} />}

      <div className="absolute right-3 top-3 flex items-start gap-1.5">
        <ToolButton label="화면에 맞추기" onClick={() => fitRef.current()}>
          <Maximize className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="표시 설정" pressed={panelOpen} onClick={() => setPanelOpen((v) => !v)}>
          <SlidersHorizontal className="h-4 w-4" />
        </ToolButton>
      </div>
      {panelOpen && <GraphSettingsPanel settings={settings} onChange={onSettingsChange} onClose={() => setPanelOpen(false)} />}

      {hovered && (
        <div className="glass-overlay pointer-events-none absolute left-4 top-4 max-w-xs rounded-lg px-3 py-2 text-xs">
          <p className="truncate text-sm font-medium">{hovered.title}</p>
          <p className="mt-0.5 text-muted-foreground">
            {hovered.kind === 'ghost'
              ? `아직 없는 메모 — 링크한 메모에서 ${MOD_CLICK}하면 만들어집니다`
              : hovered.kind === 'file'
                ? `${hovered.workspace_name} 프로젝트 · ${hovered.path} · 연결 ${hovered.links}개`
                : hovered.kind === 'folder'
                  ? `${hovered.workspace_name} · 폴더${hovered.path ? ` ${hovered.path}` : ''} · 연결 ${hovered.links}개`
                  : hovered.kind === 'desk'
                    ? `데스크 · 연결 ${hovered.links}개 · 클릭하면 이동`
                    : hovered.kind === 'category'
                      ? `${hovered.workspace_name} · 카테고리 · 연결 ${hovered.links}개 · 클릭하면 작업 목록`
                : `${hovered.workspace_name} · 연결 ${hovered.links}개`}
          </p>
        </div>
      )}
    </div>
  )
}

function ToolButton({
  label,
  pressed,
  onClick,
  children
}: {
  label: string
  pressed?: boolean
  onClick: () => void
  children: React.ReactNode
}): JSX.Element {
  return (
    <button
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'glass-overlay flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground',
        pressed && 'text-foreground ring-1 ring-primary/50'
      )}
    >
      {children}
    </button>
  )
}
