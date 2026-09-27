import { useEffect, useMemo, useState } from 'react'
import { Download, Waypoints, FolderGit2 } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { toastError } from '@/store/useToast'
import { parseGraphSettings, type GraphSettings } from '@/lib/graphStyle'
import { cn } from '@/lib/utils'
import { PageHeader } from './PageHeader'
import type { GraphData, NoteSearchHit } from '@shared/types'
import { filterGraph } from '@shared/graphFilter'
import { GraphSearch, type GraphSearchResult } from './graph/GraphSearch'
import { GraphExportDialog } from './graph/GraphExportDialog'
import { GraphCanvas, type PreparedGraph } from './graph/GraphCanvas'
import { ResizablePane } from '@/components/ui/ResizablePane'

const SETTINGS_KEY = 'aop-graph-settings'
const SEARCH_DEBOUNCE_MS = 150

function loadSettings(): GraphSettings {
  try {
    return parseGraphSettings(localStorage.getItem(SETTINGS_KEY))
  } catch {
    return parseGraphSettings(null)
  }
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

/** The nodes to show (one project, or all), with edges re-indexed onto them. */
function prepare(data: GraphData, linkedOnly: boolean, scope: string | null): PreparedGraph {
  const { nodes, edges: kept } = filterGraph(data, { scope, linkedOnly })
  const index = new Map(nodes.map((n, i) => [n.id, i]))
  const edges: [number, number][] = kept.map((e) => [index.get(e.source) as number, index.get(e.target) as number])
  const neighbours = nodes.map(() => new Set<number>())
  for (const [a, b] of edges) {
    neighbours[a].add(b)
    neighbours[b].add(a)
  }
  return { nodes, edges, neighbours }
}

export function GraphView(): JSX.Element {
  const [data, setData] = useState<GraphData | null>(null)
  const [linkedOnly, setLinkedOnly] = useState(true)
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<string | null>(null)
  const [settings, setSettings] = useState(loadSettings)
  const changeSettings = (next: GraphSettings): void => {
    setSettings(next)
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
    } catch {
      /* not remembered, still applied */
    }
  }
  const workspaces = useStore((s) => s.workspaces)
  // Linked folders changing on disk (docs edited, commits) can add or remove nodes.
  const projectVersion = useStore((s) => s.projectVersion)

  useEffect(() => {
    window.api.link.graph().then(setData, toastError)
  }, [projectVersion])

  const graph = useMemo(() => (data ? prepare(data, linkedOnly, scope) : null), [data, linkedOnly, scope])

  // Search: memo titles and bodies come from the database (debounced); documents and
  // unwritten notes are matched by title here.
  const [noteHits, setNoteHits] = useState<NoteSearchHit[]>([])
  const [focus, setFocus] = useState<{ index: number; seq: number } | null>(null)
  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setNoteHits([])
      return
    }
    const timer = setTimeout(() => window.api.search.notes(q).then(setNoteHits, toastError), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])
  const results = useMemo<GraphSearchResult[] | null>(() => {
    const q = query.trim().toLowerCase()
    if (!graph || !q) return null
    const byId = new Map(noteHits.map((h) => [h.id, h]))
    return graph.nodes.flatMap((n, index) => {
      const hit = byId.get(n.id)
      if (hit) return [{ index, title: n.title, snippet: hit.snippet, kind: n.kind }]
      return n.kind !== 'note' && n.title.toLowerCase().includes(q) ? [{ index, title: n.title, snippet: '', kind: n.kind }] : []
    })
  }, [graph, noteHits, query])
  const matches = useMemo(() => (results ? new Set(results.map((r) => r.index)) : null), [results])
  const [exporting, setExporting] = useState(false)
  const hiddenCount = results ? noteHits.length - results.filter((r) => r.kind === 'note').length : 0
  const entries = useMemo(() => (data ? projectEntries(data) : []), [data])
  const hasFolder = (id: string): boolean => Boolean(workspaces.find((w) => w.id === id)?.folder_path)

  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={Waypoints} title="그래프" count={graph?.nodes.length} />
      <div className="cq flex shrink-0 items-center gap-2 whitespace-nowrap border-b border-border px-5 py-2">
        <GraphSearch
          query={query}
          onQuery={setQuery}
          results={results}
          hiddenCount={hiddenCount}
          onPick={(index) => setFocus((f) => ({ index, seq: (f?.seq ?? 0) + 1 }))}
        />
        <button
          onClick={() => setLinkedOnly((v) => !v)}
          aria-pressed={linkedOnly}
          className={cn(
            'h-8 shrink-0 rounded-md px-2.5 text-xs transition-colors hover:bg-accent',
            linkedOnly ? 'text-foreground' : 'text-muted-foreground'
          )}
        >
          {linkedOnly ? '연결된 메모만' : '내용 있는 메모 모두'}
        </button>
        <button
          onClick={() => setExporting(true)}
          disabled={!graph || graph.nodes.length === 0}
          title="LLM용으로 내보내기 · 그래프 보관함"
          aria-label="LLM용으로 내보내기 · 그래프 보관함"
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-foreground/85 transition-colors hover:bg-accent disabled:opacity-40"
        >
          <Download className="h-3.5 w-3.5" />
          <span className="cq-hide-sm">내보내기 · 보관함</span>
        </button>
        <p className="cq-hide-md ml-auto flex min-w-0 items-center gap-3 overflow-hidden text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[hsl(228_9%_60%)]" />
            메모
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[hsl(36_85%_55%)]" />
            프로젝트 문서
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full border border-muted-foreground" />
            아직 없는 메모
          </span>
          <span className="truncate">클릭해서 열기 · 드래그로 이동 · 스크롤로 확대</span>
        </p>
      </div>

      <div className="flex min-h-0 flex-1">
        <ResizablePane
          as="nav"
          aria-label="프로젝트"
          id="graph-projects"
          label="프로젝트 목록"
          min={160}
          max={420}
          fallback={224}
          className="border-r border-border"
        >
          <div className="h-full overflow-y-auto p-2">
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
          </div>
        </ResizablePane>
        <div className="flex min-w-0 flex-1 flex-col">
          {graph && graph.nodes.length === 0 ? (
            <div className="m-auto max-w-sm px-6 text-center text-sm text-muted-foreground">
              <Waypoints className="mx-auto mb-3 h-8 w-8 opacity-40" />
              아직 연결된 메모가 없습니다. 메모에서 <code className="rounded bg-muted px-1">[[</code>를 입력해
              다른 메모를 링크하면 여기에 지식 그래프가 그려집니다.
            </div>
          ) : (
            graph && (
              <GraphCanvas graph={graph} matches={matches} focus={focus} settings={settings} onSettingsChange={changeSettings} />
            )
          )}
        </div>
      </div>
      {exporting && graph && (
        <GraphExportDialog
          scope={scope}
          scopeName={scope ? (entries.find((e) => e.id === scope)?.name ?? '데스크') : '전체 세컨드브레인'}
          linkedOnly={linkedOnly}
          searchIds={results ? results.map((r) => graph.nodes[r.index].id) : null}
          onClose={() => setExporting(false)}
        />
      )}
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
