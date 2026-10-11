// A small force-directed layout for the note graph (what Obsidian's graph view does):
// every node repels every other, links act as springs, weak gravity keeps it centred.
// State lives in flat typed arrays and is updated in place — it's a physics buffer
// stepped 60×/s, not app state.

export interface Layout {
  x: Float64Array
  y: Float64Array
  vx: Float64Array
  vy: Float64Array
  /** Pinned nodes (being dragged) keep their position. */
  pinned: boolean[]
  edges: readonly (readonly [number, number])[]
}

/** The graph view's 힘 sliders (Obsidian: repel / link distance / center force). */
export interface Forces {
  repulsion: number
  linkLength: number
  gravity: number
}

export const DEFAULT_FORCES: Forces = { repulsion: 4000, linkLength: 110, gravity: 0.008 }

const SPRING = 0.04
const DAMPING = 0.82
const MAX_SPEED = 12

/** Deterministic start on a golden-angle spiral, so layouts are stable run to run. */
export function createLayout(count: number, edges: readonly (readonly [number, number])[]): Layout {
  const x = new Float64Array(count)
  const y = new Float64Array(count)
  for (let i = 0; i < count; i++) {
    const r = 12 * Math.sqrt(i + 1)
    const a = i * 2.399963 // golden angle
    x[i] = r * Math.cos(a)
    y[i] = r * Math.sin(a)
  }
  return { x, y, vx: new Float64Array(count), vy: new Float64Array(count), pinned: Array(count).fill(false), edges }
}

/** Up to this many nodes, repulsion is exact (O(n²)); above it, Barnes–Hut (O(n log n)). */
export const EXACT_LIMIT = 800
/** Barnes–Hut opening angle: a cell this "small" from afar acts as one body. */
const THETA = 0.9
const MIN_CELL = 1e-3

export function exactRepulsion(l: Layout, repulsion: number, fx: Float64Array, fy: Float64Array): void {
  const n = l.x.length
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let dx = l.x[i] - l.x[j]
      let dy = l.y[i] - l.y[j]
      let d2 = dx * dx + dy * dy
      if (d2 < 0.01) {
        // Coincident nodes: nudge apart deterministically.
        dx = 0.1 * ((i % 3) - 1 || 1)
        dy = 0.1
        d2 = 0.02
      }
      const f = repulsion / d2
      const d = Math.sqrt(d2)
      fx[i] += (dx / d) * f
      fy[i] += (dy / d) * f
      fx[j] -= (dx / d) * f
      fy[j] -= (dy / d) * f
    }
  }
}

interface Cell {
  x0: number
  y0: number
  size: number
  mass: number
  cx: number
  cy: number
  /** Node index for a leaf holding one body; -1 = empty or internal. */
  body: number
  kids: Cell[] | null
}

const cell = (x0: number, y0: number, size: number): Cell => ({ x0, y0, size, mass: 0, cx: 0, cy: 0, body: -1, kids: null })

function insert(c: Cell, i: number, x: number, y: number, l: Layout): void {
  c.cx = (c.cx * c.mass + x) / (c.mass + 1)
  c.cy = (c.cy * c.mass + y) / (c.mass + 1)
  c.mass++
  if (c.mass === 1) {
    c.body = i
    return
  }
  if (c.size < MIN_CELL) return // coincident bodies: just aggregate the mass
  if (!c.kids) {
    const h = c.size / 2
    c.kids = [cell(c.x0, c.y0, h), cell(c.x0 + h, c.y0, h), cell(c.x0, c.y0 + h, h), cell(c.x0 + h, c.y0 + h, h)]
    const prev = c.body
    c.body = -1
    if (prev >= 0) insertKid(c, prev, l.x[prev], l.y[prev], l)
  }
  insertKid(c, i, x, y, l)
}

function insertKid(c: Cell, i: number, x: number, y: number, l: Layout): void {
  const h = c.size / 2
  const k = (x >= c.x0 + h ? 1 : 0) + (y >= c.y0 + h ? 2 : 0)
  insert((c.kids as Cell[])[k], i, x, y, l)
}

function push(c: Cell, i: number, l: Layout, repulsion: number, fx: Float64Array, fy: Float64Array): void {
  if (c.mass === 0 || c.body === i) return
  const dx = l.x[i] - c.cx
  const dy = l.y[i] - c.cy
  const d2 = Math.max(dx * dx + dy * dy, 0.02)
  if (!c.kids || c.size * c.size < THETA * THETA * d2) {
    const d = Math.sqrt(d2)
    const f = (repulsion * c.mass) / d2
    fx[i] += ((dx || 0.1) / d) * f
    fy[i] += ((dy || 0.1) / d) * f
    return
  }
  for (const k of c.kids) push(k, i, l, repulsion, fx, fy)
}

export function barnesHut(l: Layout, repulsion: number, fx: Float64Array, fy: Float64Array): void {
  const n = l.x.length
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, l.x[i]); maxX = Math.max(maxX, l.x[i])
    minY = Math.min(minY, l.y[i]); maxY = Math.max(maxY, l.y[i])
  }
  const root = cell(minX, minY, Math.max(maxX - minX, maxY - minY) + 1)
  for (let i = 0; i < n; i++) insert(root, i, l.x[i], l.y[i], l)
  for (let i = 0; i < n; i++) push(root, i, l, repulsion, fx, fy)
}

/** Advance one step; returns the mean speed (≈ remaining motion) so callers can stop when settled. */
export function tickLayout(l: Layout, forces: Forces = DEFAULT_FORCES): number {
  const n = l.x.length
  const fx = new Float64Array(n)
  const fy = new Float64Array(n)

  if (n > EXACT_LIMIT) barnesHut(l, forces.repulsion, fx, fy)
  else exactRepulsion(l, forces.repulsion, fx, fy)

  for (const [a, b] of l.edges) {
    const dx = l.x[b] - l.x[a]
    const dy = l.y[b] - l.y[a]
    const d = Math.hypot(dx, dy) || 0.01
    const f = SPRING * (d - forces.linkLength)
    fx[a] += (dx / d) * f
    fy[a] += (dy / d) * f
    fx[b] -= (dx / d) * f
    fy[b] -= (dy / d) * f
  }

  let motion = 0
  for (let i = 0; i < n; i++) {
    if (l.pinned[i]) {
      l.vx[i] = 0
      l.vy[i] = 0
      continue
    }
    fx[i] -= l.x[i] * forces.gravity
    fy[i] -= l.y[i] * forces.gravity
    l.vx[i] = (l.vx[i] + fx[i]) * DAMPING
    l.vy[i] = (l.vy[i] + fy[i]) * DAMPING
    const speed = Math.hypot(l.vx[i], l.vy[i])
    if (speed > MAX_SPEED) {
      l.vx[i] *= MAX_SPEED / speed
      l.vy[i] *= MAX_SPEED / speed
    }
    l.x[i] += l.vx[i]
    l.y[i] += l.vy[i]
    motion += Math.min(speed, MAX_SPEED)
  }
  return n ? motion / n : 0
}

const EASE = 0.2

/** Glide every node toward a fixed position (tree view); returns the mean remaining move.
 *  Velocities are cleared so the physics resumes calmly when switching back. */
export function easeTo(l: Layout, tx: Float64Array, ty: Float64Array): number {
  const n = l.x.length
  let motion = 0
  for (let i = 0; i < n; i++) {
    const dx = tx[i] - l.x[i]
    const dy = ty[i] - l.y[i]
    l.x[i] += dx * EASE
    l.y[i] += dy * EASE
    l.vx[i] = 0
    l.vy[i] = 0
    motion += Math.abs(dx) + Math.abs(dy)
  }
  return n ? (motion * EASE) / n : 0
}
