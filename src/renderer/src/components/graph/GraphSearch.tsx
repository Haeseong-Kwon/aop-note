import { useState } from 'react'
import { FileText, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GraphNode } from '@shared/types'

export interface GraphSearchResult {
  /** Index into the prepared graph's nodes. */
  index: number
  title: string
  snippet: string
  kind: GraphNode['kind']
}

const MAX_LISTED = 30

interface GraphSearchProps {
  query: string
  onQuery: (q: string) => void
  /** null while the box is empty. */
  results: GraphSearchResult[] | null
  /** Memos that match but aren't drawn (e.g. no links while "연결된 메모만" is on). */
  hiddenCount: number
  onPick: (index: number) => void
}

/** Search box over the graph: titles and memo bodies; picking a hit flies to its node. */
export function GraphSearch({ query, onQuery, results, hiddenCount, onPick }: GraphSearchProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const listed = results?.slice(0, MAX_LISTED) ?? []
  const pick = (r: GraphSearchResult | undefined): void => {
    if (!r) return
    onPick(r.index)
    setOpen(false)
  }

  return (
    <div className="relative w-72 min-w-[10rem] shrink">
      <label className="flex h-8 items-center gap-2 rounded-md border border-input bg-background/60 px-2.5 focus-within:ring-2 focus-within:ring-ring">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => {
            onQuery(e.target.value)
            setActive(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return // 한글 IME 조합 중에는 무시
            if (e.key === 'ArrowDown') setActive((i) => Math.min(listed.length - 1, i + 1))
            else if (e.key === 'ArrowUp') setActive((i) => Math.max(0, i - 1))
            else if (e.key === 'Enter') pick(listed[active])
            else if (e.key === 'Escape') setOpen(false)
            else return
            e.preventDefault()
          }}
          placeholder="제목·메모 내용 검색"
          aria-label="그래프에서 메모 검색"
          role="combobox"
          aria-expanded={open && results !== null}
          aria-controls="graph-search-results"
          className="h-full min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
        />
        {query && (
          <button onMouseDown={(e) => e.preventDefault()} onClick={() => onQuery('')} aria-label="검색 지우기" className="text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </label>

      {open && results !== null && (
        <div
          id="graph-search-results"
          role="listbox"
          className="glass-overlay absolute left-0 top-10 z-30 max-h-80 w-96 overflow-y-auto rounded-lg p-1 text-xs"
        >
          <p className="px-2 py-1 text-[11px] text-muted-foreground">
            {results.length ? `${results.length}개 일치` : '일치하는 메모가 없습니다'}
            {hiddenCount > 0 && ` · 링크 없는 메모 ${hiddenCount}개는 ‘내용 있는 메모 모두’에서 보입니다`}
          </p>
          {listed.map((r, i) => (
            <button
              key={r.index}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()} // keep focus in the box
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(r)}
              className={cn('flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left', i === active && 'bg-accent')}
            >
              {r.kind === 'file' ? (
                <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(36_85%_55%)]" />
              ) : (
                <span className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', r.kind === 'ghost' ? 'border border-muted-foreground' : 'bg-primary')} />
              )}
              <span className="min-w-0">
                <span className="block truncate font-medium text-foreground">{r.title}</span>
                {r.snippet && <span className="block truncate text-muted-foreground">{r.snippet}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
