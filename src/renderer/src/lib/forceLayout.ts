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

const REPULSION = 4000
const SPRING = 0.04
const LINK_LENGTH = 110
const GRAVITY = 0.008
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

/** Advance one step; returns the mean speed (≈ remaining motion) so callers can stop when settled. */
export function tickLayout(l: Layout): number {
  const n = l.x.length
  const fx = new Float64Array(n)
  const fy = new Float64Array(n)

  // ponytail: O(n²) repulsion — smooth up to ~1–2k notes; Barnes–Hut if graphs get bigger.
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
      const f = REPULSION / d2
      const d = Math.sqrt(d2)
      fx[i] += (dx / d) * f
      fy[i] += (dy / d) * f
      fx[j] -= (dx / d) * f
      fy[j] -= (dy / d) * f
    }
  }

  for (const [a, b] of l.edges) {
    const dx = l.x[b] - l.x[a]
    const dy = l.y[b] - l.y[a]
    const d = Math.hypot(dx, dy) || 0.01
    const f = SPRING * (d - LINK_LENGTH)
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
    fx[i] -= l.x[i] * GRAVITY
    fy[i] -= l.y[i] * GRAVITY
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
