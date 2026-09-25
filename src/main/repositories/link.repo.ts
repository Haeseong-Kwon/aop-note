import { taskRepo } from './task.repo'
import { extractLinks, normalizeTitle } from '@shared/links'
import type { Backlinks, BacklinkHit, GraphData, GraphNode, TaskWithContext } from '@shared/types'

// ponytail: links are derived by scanning every live note on each call — fine for
// thousands of notes; add a links table maintained on save if it ever shows up in a profile.

const SNIPPET_MAX = 160

/** Same-desk note wins (like Obsidian's nearest match); otherwise the most recently edited. */
export function resolveIn(tasks: TaskWithContext[], title: string, fromWorkspaceId: string | null): TaskWithContext | null {
  const key = normalizeTitle(title)
  const candidates = tasks.filter((t) => normalizeTitle(t.title) === key)
  if (candidates.length === 0) return null
  return (
    candidates.find((t) => t.workspace_id === fromWorkspaceId) ??
    [...candidates].sort((x, y) => y.updated_at.localeCompare(x.updated_at))[0]
  )
}

function lineAt(text: string, index: number): string {
  const start = text.lastIndexOf('\n', index - 1) + 1
  const end = text.indexOf('\n', index)
  return text.slice(start, end === -1 ? undefined : end).trim().slice(0, SNIPPET_MAX)
}

export const linkRepo = {
  resolve(title: string, fromTaskId: string | null): TaskWithContext | null {
    const tasks = taskRepo.listAllWithContext()
    const from = tasks.find((t) => t.id === fromTaskId)
    return resolveIn(tasks, title, from?.workspace_id ?? null)
  },

  backlinks(taskId: string): Backlinks {
    const tasks = taskRepo.listAllWithContext()
    const target = tasks.find((t) => t.id === taskId)
    if (!target) return { linked: [], mentions: [] }
    const key = normalizeTitle(target.title)

    const linked: BacklinkHit[] = []
    const mentions: BacklinkHit[] = []
    for (const t of tasks) {
      if (t.id === target.id || !t.note) continue
      const link = extractLinks(t.note).find((l) => resolveIn(tasks, l.target, t.workspace_id)?.id === target.id)
      if (link) {
        linked.push({ task: t, snippet: lineAt(t.note, link.index) })
        continue
      }
      // One-character titles would match everywhere; they're not worth suggesting.
      const at = key.length >= 2 ? t.note.toLowerCase().indexOf(key) : -1
      if (at >= 0) mentions.push({ task: t, snippet: lineAt(t.note, at) })
    }
    return { linked, mentions }
  },

  /** Every note that links or is linked, plus notes with content; unresolved links become ghosts. */
  graph(): GraphData {
    const tasks = taskRepo.listAllWithContext()
    const nodes = new Map<string, GraphNode>()
    const neighbours = new Map<string, Set<string>>()
    const edges: GraphData['edges'] = []

    const node = (t: TaskWithContext): GraphNode => {
      const existing = nodes.get(t.id)
      if (existing) return existing
      const created: GraphNode = {
        id: t.id,
        title: t.title,
        color: t.workspace_color,
        ghost: false,
        workspace_id: t.workspace_id,
        workspace_name: t.workspace_name,
        category_id: t.category_id,
        links: 0
      }
      nodes.set(t.id, created)
      return created
    }
    const connect = (source: string, target: string): void => {
      if (source === target || neighbours.get(source)?.has(target)) return
      for (const [x, y] of [[source, target], [target, source]]) {
        if (!neighbours.has(x)) neighbours.set(x, new Set())
        neighbours.get(x)?.add(y)
      }
      edges.push({ source, target })
    }

    for (const t of tasks) {
      if (t.note.trim()) node(t)
      for (const l of extractLinks(t.note)) {
        node(t)
        const hit = resolveIn(tasks, l.target, t.workspace_id)
        if (hit) {
          connect(t.id, node(hit).id)
          continue
        }
        const ghostId = `ghost:${normalizeTitle(l.target)}`
        if (!nodes.has(ghostId)) {
          nodes.set(ghostId, {
            id: ghostId,
            title: l.target,
            color: t.workspace_color,
            ghost: true,
            workspace_id: null,
            workspace_name: null,
            category_id: null,
            links: 0
          })
        }
        connect(t.id, ghostId)
      }
    }

    for (const n of nodes.values()) n.links = neighbours.get(n.id)?.size ?? 0
    return { nodes: [...nodes.values()], edges }
  }
}
