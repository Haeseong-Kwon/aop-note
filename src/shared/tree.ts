// Parent/child trees for nested folders (categories) and sub-memos (tasks).

export interface TreeNode {
  id: string
  parent_id: string | null
}

export interface TreeRow<T> {
  item: T
  depth: number
  hasChildren: boolean
}

/**
 * Depth-first rows, siblings in input order. An item whose parent isn't in the
 * list shows as a root; a collapsed item's descendants are skipped; cycles are dropped.
 */
export function flattenTree<T extends TreeNode>(items: readonly T[], collapsed?: ReadonlySet<string>): TreeRow<T>[] {
  const ids = new Set(items.map((i) => i.id))
  const childrenOf = new Map<string | null, T[]>()
  for (const item of items) {
    const parent = item.parent_id && ids.has(item.parent_id) ? item.parent_id : null
    childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), item])
  }
  const walk = (parent: string | null, depth: number): TreeRow<T>[] =>
    (childrenOf.get(parent) ?? []).flatMap((item) => [
      { item, depth, hasChildren: childrenOf.has(item.id) },
      ...(collapsed?.has(item.id) ? [] : walk(item.id, depth + 1))
    ])
  return walk(null, 0)
}

/** Ancestors of `id`, root first (for breadcrumbs). */
export function ancestorsOf<T extends TreeNode>(items: readonly T[], id: string): T[] {
  const byId = new Map(items.map((i) => [i.id, i]))
  const chain: T[] = []
  const seen = new Set([id])
  for (let p = byId.get(byId.get(id)?.parent_id ?? ''); p && !seen.has(p.id); p = byId.get(p.parent_id ?? '')) {
    seen.add(p.id)
    chain.unshift(p)
  }
  return chain
}
