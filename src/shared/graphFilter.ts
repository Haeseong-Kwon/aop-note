// Which part of the knowledge graph to show / export. Shared by the graph view and the
// LLM export so "what you see" is exactly "what you export".
import type { GraphData } from './types'

export interface GraphFilter {
  /** One desk (plus the unwritten notes it links to), or null for all. */
  scope: string | null
  /** Drop nodes without links. */
  linkedOnly: boolean
  /** Include the structure (desks, categories, folders and their containment edges).
   *  false = a pure [[link]] graph, like Obsidian's. Default true. */
  structure?: boolean
  /** Keep only these node ids and their neighbourhood… */
  focus?: string[] | null
  /** …up to this many links away (0 = just the focus). */
  hops?: number
}

const STRUCTURAL = new Set(['desk', 'category', 'folder'])

export function filterGraph(input: GraphData, f: GraphFilter): GraphData {
  // Links only: drop containment edges and the container nodes, then recount links.
  const data: GraphData =
    f.structure === false
      ? (() => {
          const edges = input.edges.filter((e) => e.kind !== 'structure')
          const degree = new Map<string, number>()
          for (const e of edges) for (const id of [e.source, e.target]) degree.set(id, (degree.get(id) ?? 0) + 1)
          return {
            nodes: input.nodes.filter((n) => !STRUCTURAL.has(n.kind)).map((n) => ({ ...n, links: degree.get(n.id) ?? 0 })),
            edges
          }
        })()
      : input
  let keep = new Set(data.nodes.map((n) => n.id))

  if (f.scope) {
    const own = new Set(data.nodes.filter((n) => n.workspace_id === f.scope).map((n) => n.id))
    // Unwritten notes this desk links to belong to its picture too.
    for (const e of data.edges) {
      if (own.has(e.source) && e.target.startsWith('ghost:')) own.add(e.target)
      if (own.has(e.target) && e.source.startsWith('ghost:')) own.add(e.source)
    }
    keep = own
  }
  if (f.linkedOnly) keep = new Set(data.nodes.filter((n) => keep.has(n.id) && n.links > 0).map((n) => n.id))

  if (f.focus) {
    let frontier = new Set(f.focus.filter((id) => keep.has(id)))
    const reached = new Set(frontier)
    for (let hop = 0; hop < (f.hops ?? 0); hop++) {
      const next = new Set<string>()
      for (const e of data.edges) {
        if (!keep.has(e.source) || !keep.has(e.target)) continue
        if (frontier.has(e.source) && !reached.has(e.target)) next.add(e.target)
        if (frontier.has(e.target) && !reached.has(e.source)) next.add(e.source)
      }
      next.forEach((id) => reached.add(id))
      frontier = next
    }
    keep = reached
  }

  return {
    nodes: data.nodes.filter((n) => keep.has(n.id)),
    edges: data.edges.filter((e) => keep.has(e.source) && keep.has(e.target))
  }
}
