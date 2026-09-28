// The app's own structure as graph edges, so everything shows up without a single
// [[link]]: desk → sub-desk / category → sub-category → memo → sub-memo, the linked
// folder under its desk, and the 문서함 (folders, uploads, memo attachments).
import type { GraphEdgeKind, GraphNode, TaskWithContext, Workspace } from '@shared/types'
import { workspaceRepo } from './workspace.repo'
import { categoryRepo } from './category.repo'
import { attachmentRepo } from './attachment.repo'
import { docFolderRepo } from './docFolder.repo'

export interface GraphBuilder {
  /** Add the node if it's new; returns its id. */
  add: (node: GraphNode) => string
  has: (id: string) => boolean
  connect: (source: string, target: string, kind: GraphEdgeKind) => void
}

const BASE = { category_id: null, path: null, links: 0, attachment_id: null }

export const deskNodeId = (deskId: string): string => `desk:${deskId}`

export function addAppStructure(g: GraphBuilder, tasks: TaskWithContext[]): void {
  const desks = workspaceRepo.list()
  const deskIds = new Set(desks.map((d) => d.id))
  const deskNode = (d: Workspace): string =>
    g.add({ ...BASE, id: deskNodeId(d.id), title: d.name, color: d.color, kind: 'desk', workspace_id: d.id, workspace_name: d.name })

  for (const d of desks) {
    deskNode(d)
    const parent = d.parent_id && deskIds.has(d.parent_id) ? desks.find((p) => p.id === d.parent_id) : null
    if (parent) g.connect(deskNode(parent), deskNodeId(d.id), 'structure')
    // The linked folder's tree (added with the documents) hangs off its desk.
    if (g.has(`folder:${d.id}:`)) g.connect(deskNodeId(d.id), `folder:${d.id}:`, 'structure')

    const categories = categoryRepo.listByWorkspace(d.id)
    const catIds = new Set(categories.map((c) => c.id))
    for (const c of categories) {
      const id = g.add({ ...BASE, id: `category:${c.id}`, title: c.name, color: c.color, kind: 'category', workspace_id: d.id, workspace_name: d.name, category_id: c.id })
      g.connect(c.parent_id && catIds.has(c.parent_id) ? `category:${c.parent_id}` : deskNodeId(d.id), id, 'structure')
    }

    const folders = docFolderRepo.list(d.id)
    const folderIds = new Set(folders.map((f) => f.id))
    for (const f of folders) {
      const id = g.add({ ...BASE, id: `docfolder:${f.id}`, title: f.name, color: d.color, kind: 'folder', workspace_id: d.id, workspace_name: d.name })
      g.connect(f.parent_id && folderIds.has(f.parent_id) ? `docfolder:${f.parent_id}` : deskNodeId(d.id), id, 'structure')
    }
    for (const a of attachmentRepo.listByWorkspace(d.id)) {
      const id = g.add({
        ...BASE,
        id: `attachment:${a.id}`,
        title: a.file_name,
        color: d.color,
        kind: 'file',
        path: a.file_name,
        workspace_id: d.id,
        workspace_name: d.name,
        attachment_id: a.id
      })
      if (a.task_id) g.connect(a.task_id, id, 'structure')
      if (a.folder_id && folderIds.has(a.folder_id)) g.connect(`docfolder:${a.folder_id}`, id, 'structure')
      else if (!a.task_id) g.connect(deskNodeId(d.id), id, 'structure')
    }
  }

  // Memos: under their parent memo when they have one (in view), else under their category.
  const live = new Set(tasks.map((t) => t.id))
  for (const t of tasks) {
    g.connect(t.parent_id && live.has(t.parent_id) ? t.parent_id : `category:${t.category_id}`, t.id, 'structure')
  }
}
