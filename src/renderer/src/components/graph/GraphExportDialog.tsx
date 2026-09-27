import { useEffect, useState } from 'react'
import { Archive, ClipboardCopy, Download, ExternalLink, FolderOpen, Loader2, Save, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toastError, useToast } from '@/store/useToast'
import { cn, FILE_MANAGER } from '@/lib/utils'
import type { GraphArchiveEntry, GraphExportFormat, GraphExportRequest, GraphExportStats } from '@shared/types'

const STATS_DEBOUNCE_MS = 250

const DETAIL = [
  { label: '제목·링크만', includeBodies: false, maxBodyChars: null },
  { label: '요약 (메모당 1,500자)', includeBodies: true, maxBodyChars: 1500 },
  { label: '보통 (메모당 4,000자)', includeBodies: true, maxBodyChars: 4000 },
  { label: '전체 본문', includeBodies: true, maxBodyChars: null }
] as const

const n = (v: number): string => v.toLocaleString('ko-KR')
const when = (iso: string): string => {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export interface GraphExportScope {
  scope: string | null
  /** Shown as the default name. */
  scopeName: string
  linkedOnly: boolean
  /** Search hits in the graph (node ids), or null when not searching. */
  searchIds: string[] | null
}

interface GraphExportDialogProps extends GraphExportScope {
  onClose: () => void
}

/** Export the graph as an LLM context pack, and the 그래프 보관함 of saved packs. */
export function GraphExportDialog({ scope, scopeName, linkedOnly, searchIds, onClose }: GraphExportDialogProps): JSX.Element {
  const showToast = useToast((s) => s.show)
  const [title, setTitle] = useState(scopeName)
  const [range, setRange] = useState<'view' | 'search'>(searchIds?.length ? 'search' : 'view')
  const [hops, setHops] = useState(1)
  const [detail, setDetail] = useState(2)
  const [format, setFormat] = useState<GraphExportFormat>('md')
  const [stats, setStats] = useState<GraphExportStats | null>(null)
  const [busy, setBusy] = useState(false)
  const [archive, setArchive] = useState<GraphArchiveEntry[]>([])

  const request: GraphExportRequest = {
    title,
    format,
    scope,
    linkedOnly,
    focus: range === 'search' ? searchIds : null,
    hops,
    includeBodies: DETAIL[detail].includeBodies,
    maxBodyChars: DETAIL[detail].maxBodyChars
  }
  const requestKey = JSON.stringify(request)

  const reloadArchive = (): Promise<void> => window.api.graph.list().then(setArchive, toastError)
  useEffect(() => void reloadArchive(), [])
  useEffect(() => {
    setStats(null)
    const timer = setTimeout(() => window.api.graph.stats(request).then(setStats, toastError), STATS_DEBOUNCE_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey])

  const run = async (action: () => Promise<unknown>, message: string): Promise<void> => {
    setBusy(true)
    try {
      await action()
      showToast({ message })
    } catch (e) {
      toastError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <header className="border-b border-border px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Download className="h-4 w-4 text-primary" />
            세컨드브레인 내보내기
          </DialogTitle>
          <DialogDescription className="mt-1 text-xs">
            그래프를 LLM이 읽기 좋은 컨텍스트 팩으로 만듭니다. 허브 요약 · 노드 목록 · 링크 · 본문 순서라 Claude·ChatGPT에 그대로 붙여 넣으면 됩니다.
          </DialogDescription>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 text-sm">
          <div className="grid grid-cols-[6rem_1fr] items-center gap-x-3 gap-y-3">
            <label htmlFor="graph-export-title" className="text-muted-foreground">이름</label>
            <input
              id="graph-export-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-8 rounded-md border border-input bg-background/60 px-2 outline-none focus:ring-2 focus:ring-ring"
            />

            <span className="text-muted-foreground">범위</span>
            <div className="flex flex-wrap items-center gap-2">
              <Choice active={range === 'view'} onClick={() => setRange('view')}>
                지금 보이는 그래프
              </Choice>
              <Choice active={range === 'search'} disabled={!searchIds?.length} onClick={() => setRange('search')}>
                검색 결과 {searchIds?.length ? `${searchIds.length}개` : '(검색어 없음)'}
              </Choice>
              {range === 'search' && (
                <select
                  value={hops}
                  onChange={(e) => setHops(Number(e.target.value))}
                  aria-label="이웃 범위"
                  className="h-8 rounded-md border border-input bg-background/60 px-2 text-xs outline-none"
                >
                  <option value={0}>결과만</option>
                  <option value={1}>+ 바로 연결된 노드</option>
                  <option value={2}>+ 2단계 이웃</option>
                </select>
              )}
            </div>

            <span className="text-muted-foreground">내용</span>
            <div className="flex flex-wrap gap-2">
              {DETAIL.map((d, i) => (
                <Choice key={d.label} active={detail === i} onClick={() => setDetail(i)}>
                  {d.label}
                </Choice>
              ))}
            </div>

            <span className="text-muted-foreground">형식</span>
            <div className="flex flex-wrap gap-2">
              <Choice active={format === 'md'} onClick={() => setFormat('md')}>
                Markdown · LLM용
              </Choice>
              <Choice active={format === 'json'} onClick={() => setFormat('json')}>
                JSON · 도구·에이전트용
              </Choice>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-muted/50 px-3 py-2.5">
            <p className="min-w-0 flex-1 text-xs text-muted-foreground" aria-live="polite">
              {stats ? (
                <>
                  노드 <b className="text-foreground">{n(stats.nodes)}</b> · 링크 <b className="text-foreground">{n(stats.edges)}</b> · 약{' '}
                  <b className="text-foreground">{n(stats.tokens)}</b> 토큰
                </>
              ) : (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  크기 계산 중…
                </span>
              )}
            </p>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => window.api.graph.copy(request), '클립보드에 복사했습니다. LLM 대화창에 붙여 넣으세요.')}>
              <ClipboardCopy className="h-3.5 w-3.5" />
              클립보드에 복사
            </Button>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => run(async () => {
                await window.api.graph.save(request)
                await reloadArchive()
              }, '그래프 보관함에 저장했습니다.')}
            >
              <Save className="h-3.5 w-3.5" />
              보관함에 저장
            </Button>
          </div>

          <section className="mt-6" aria-label="그래프 보관함">
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Archive className="h-3.5 w-3.5" />
              그래프 보관함 {archive.length > 0 && `· ${archive.length}`}
            </h3>
            {archive.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                저장한 그래프가 여기에 모입니다. 시점별로 남겨 두고 필요할 때 다시 복사하세요.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {archive.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">{e.format}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{e.title}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {when(e.created_at)} · {e.scope} · 노드 {n(e.nodes)} · 약 {n(e.tokens)} 토큰
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center">
                      <RowButton label="클립보드에 복사" onClick={() => run(() => window.api.graph.copyArchived(e.id), '클립보드에 복사했습니다.')}>
                        <ClipboardCopy className="h-3.5 w-3.5" />
                      </RowButton>
                      <RowButton label="기본 앱으로 열기" onClick={() => window.api.graph.open(e.id).catch(toastError)}>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </RowButton>
                      <RowButton label={`${FILE_MANAGER}에서 보기`} onClick={() => window.api.graph.reveal(e.id).catch(toastError)}>
                        <FolderOpen className="h-3.5 w-3.5" />
                      </RowButton>
                      <RowButton label="다른 곳에 저장" onClick={() => window.api.graph.saveAs(e.id).catch(toastError)}>
                        <Download className="h-3.5 w-3.5" />
                      </RowButton>
                      <RowButton
                        label="삭제"
                        danger
                        onClick={() => run(async () => {
                          await window.api.graph.remove(e.id)
                          await reloadArchive()
                        }, '보관함에서 삭제했습니다.')}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </RowButton>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Choice({ active, disabled, onClick, children }: { active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }): JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'h-8 whitespace-nowrap rounded-md border px-2.5 text-xs transition-colors disabled:opacity-40',
        active ? 'border-primary/60 bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}

function RowButton({ label, danger, onClick, children }: { label: string; danger?: boolean; onClick: () => void; children: React.ReactNode }): JSX.Element {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn('rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent', danger ? 'hover:text-destructive' : 'hover:text-foreground')}
    >
      {children}
    </button>
  )
}
