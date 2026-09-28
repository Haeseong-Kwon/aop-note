// Tidy left→right tree for the graph's 트리 view, over containment edges
// (desk → category → memo, folder → document). Leaves take consecutive rows, a parent
// sits centred on its children; collapsed subtrees are hidden and parked on their
// collapsed ancestor so they fold into it when animated.

export interface TreeOptions {
  /** Horizontal distance between depths. */
  gapX: number
  /** Vertical distance between rows. */
  gapY: number
}

export interface TreeResult {
  x: Float64Array
  y: Float64Array
  depth: number[]
  /** Parent in the tree, -1 for a root. */
  parent: Int32Array
  childCount: number[]
  visible: boolean[]
}

export function treeLayout(
  count: number,
  edges: readonly (readonly [number, number])[],
  collapsed: ReadonlySet<number>,
  { gapX, gapY }: TreeOptions
): TreeResult {
  const parent = new Int32Array(count).fill(-1)
  const children: number[][] = Array.from({ length: count }, () => [])
  // First parent wins (a memo attachment filed in a 문서함 folder has two); no cycles.
  const reaches = (from: number, to: number): boolean => {
    for (let p = from; p !== -1; p = parent[p]) if (p === to) return true
    return false
  }
  for (const [p, c] of edges) {
    if (p === c || parent[c] !== -1 || reaches(p, c)) continue
    parent[c] = p
    children[p].push(c)
  }

  const x = new Float64Array(count)
  const y = new Float64Array(count)
  const depth = new Array<number>(count).fill(0)
  const visible = new Array<boolean>(count).fill(false)
  let row = 0

  const place = (n: number, d: number): void => {
    depth[n] = d
    x[n] = d * gapX
    visible[n] = true
    const kids = children[n]
    if (kids.length === 0 || collapsed.has(n)) {
      y[n] = row++ * gapY
      for (const k of kids) park(k, n, d + 1)
      return
    }
    for (const k of kids) place(k, d + 1)
    y[n] = (y[kids[0]] + y[kids[kids.length - 1]]) / 2
  }
  // Hidden under a collapsed ancestor: sits on it, depth kept for the record.
  const park = (n: number, at: number, d: number): void => {
    depth[n] = d
    x[n] = x[at]
    y[n] = y[at]
    visible[n] = false
    for (const k of children[n]) park(k, at, d + 1)
  }

  // Trees first (in input order), then nodes with no structure at all.
  const roots = [...Array(count).keys()].filter((n) => parent[n] === -1)
  for (const r of roots.filter((n) => children[n].length > 0)) place(r, 0)
  for (const r of roots.filter((n) => children[n].length === 0)) place(r, 0)

  return { x, y, depth, parent, childCount: children.map((k) => k.length), visible }
}
