import { useState } from 'react'
import { ChevronLeft, RotateCcw, Search, Wrench } from 'lucide-react'
import { PageHeader } from '../PageHeader'
import { Button } from '@/components/ui/button'
import { useToast } from '@/store/useToast'
import { cn } from '@/lib/utils'
import { GROUPS, GROUP_ORDER, TOOLS, clearToolInputs, findTool, matchesTool, pushRecent, readActiveTool, readRecent, toolVars, writeActiveTool, type Tool } from './registry'

export function ToolsView(): JSX.Element {
  const [activeId, setActiveId] = useState<string | null>(readActiveTool)
  const [recent, setRecent] = useState<string[]>(readRecent)
  const [query, setQuery] = useState('')
  const open = (id: string | null): void => {
    setActiveId(id)
    writeActiveTool(id)
    if (id) setRecent(pushRecent(id))
  }
  const active = findTool(activeId)

  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={Wrench} title="도구" count={TOOLS.length} />
      <div className="cq flex min-h-0 flex-1">
        <ToolRail active={active} query={query} onQuery={setQuery} onPick={open} />
        <div className="min-w-0 flex-1 overflow-y-auto">
          {active ? <ToolPage key={active.id} tool={active} onBack={() => open(null)} /> : <Gallery query={query} onQuery={setQuery} onPick={open} recent={recent} />}
        </div>
      </div>
    </div>
  )
}

function ToolRail({ active, query, onQuery, onPick }: { active: Tool | null; query: string; onQuery: (q: string) => void; onPick: (id: string) => void }): JSX.Element {
  return (
    <nav aria-label="도구 목록" className="cq-hide-md flex w-56 shrink-0 flex-col border-r border-border">
      <div className="p-2">
        <SearchBox value={query} onChange={onQuery} compact />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {GROUP_ORDER.map((g) => {
          const tools = TOOLS.filter((t) => t.group === g && matchesTool(t, query))
          if (tools.length === 0) return null
          return (
            <section key={g} className="mt-3 first:mt-1">
              <h3 className="flex items-center gap-1.5 px-2 pb-1 text-[11px] font-medium text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: GROUPS[g].color }} />
                {GROUPS[g].name}
              </h3>
              {tools.map((t) => {
                const on = active?.id === t.id
                return (
                  <button
                    key={t.id}
                    onClick={() => onPick(t.id)}
                    aria-current={on ? 'page' : undefined}
                    style={toolVars(t.group)}
                    className={cn(
                      'relative flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] transition-colors duration-fast',
                      on ? 'bg-[color:var(--tool-soft)] font-medium text-foreground' : 'text-muted-foreground hover:bg-accent/70 hover:text-foreground'
                    )}
                  >
                    {on && <span aria-hidden className="absolute inset-y-1.5 left-0 w-[2px] rounded-full bg-[color:var(--tool)]" />}
                    <t.icon className={cn('h-3.5 w-3.5 shrink-0', on && 'text-[color:var(--tool)]')} />
                    <span className="truncate">{t.name}</span>
                  </button>
                )
              })}
            </section>
          )
        })}
      </div>
    </nav>
  )
}

export function SearchBox({ value, onChange, compact, autoFocus }: { value: string; onChange: (v: string) => void; compact?: boolean; autoFocus?: boolean }): JSX.Element {
  return (
    <label className={cn('flex items-center gap-2 border border-input bg-background/70 transition-colors focus-within:border-foreground/25', compact ? 'h-8 rounded-lg px-2.5' : 'h-11 rounded-xl px-3')}>
      <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <input autoFocus={autoFocus} value={value} onChange={(e) => onChange(e.target.value)} placeholder="도구 찾기 (예: 부가세, 연차, 퍼널)" aria-label="도구 찾기" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/60" />
    </label>
  )
}

function Gallery({ query, onQuery, onPick, recent }: { query: string; onQuery: (q: string) => void; onPick: (id: string) => void; recent: string[] }): JSX.Element {
  const any = TOOLS.some((t) => matchesTool(t, query))
  const recentTools = recent.map(findTool).filter((t): t is Tool => Boolean(t))
  return (
    <div className="mx-auto max-w-5xl px-8 pb-12 pt-8">
      <header className="border-b border-border pb-7">
        <h2 className="text-[28px] font-semibold leading-tight tracking-[-0.035em]">업무용 도구 {TOOLS.length}가지</h2>
        <p className="mt-1.5 max-w-lg text-[13.5px] leading-relaxed text-muted-foreground">견적, 세금, 급여, 일정처럼 업무 중에 자주 따지는 숫자를 바로 계산합니다. 입력한 값은 이 기기에만 남고, 도구마다 초기화할 수 있습니다. 오른쪽 아래 도구 버튼으로 어느 화면에서든 꺼내 쓸 수 있습니다.</p>
        <div className="mt-5 max-w-md">
          <SearchBox value={query} onChange={onQuery} />
        </div>
        {!query && recentTools.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[12px] text-muted-foreground">최근 사용</span>
            {recentTools.map((t) => (
              <button key={t.id} onClick={() => onPick(t.id)} style={toolVars(t.group)} className="flex h-7 items-center gap-1.5 rounded-full border border-border bg-background/70 pl-2 pr-2.5 text-[12px] font-medium transition-colors hover:border-[color:var(--tool-line)] hover:bg-[color:var(--tool-soft)]">
                <t.icon className="h-3 w-3 text-[color:var(--tool)]" />
                {t.name}
              </button>
            ))}
          </div>
        )}
      </header>

      {!any && <p className="mt-10 text-sm text-muted-foreground">‘{query}’에 맞는 도구가 없습니다. 다른 단어로 찾아보세요.</p>}
      {GROUP_ORDER.map((g) => {
        const tools = TOOLS.filter((t) => t.group === g && matchesTool(t, query))
        if (tools.length === 0) return null
        const G = GROUPS[g]
        return (
          <section key={g} className="mt-9" style={toolVars(g)} aria-labelledby={`tools-${g}`}>
            <div className="flex items-baseline gap-2.5">
              <h3 id={`tools-${g}`} className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.02em]">
                <G.icon className="h-4 w-4 text-[color:var(--tool)]" />
                {G.name}
              </h3>
              <span className="text-[12.5px] text-muted-foreground">{G.blurb}</span>
            </div>
            <div className="tool-gallery mt-3 grid gap-1.5">
              {tools.map((t) => (
                <button key={t.id} onClick={() => onPick(t.id)} className="tool-tile group flex items-center gap-3 rounded-xl border border-transparent p-2.5 text-left focus-visible:outline-none">
                  <span className="tool-tile-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[color:var(--tool-soft)] text-[color:var(--tool)]">
                    <t.icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold tracking-[-0.01em]">{t.name}</span>
                    <span className="block truncate text-[12px] text-muted-foreground">{t.blurb}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function ToolPage({ tool, onBack }: { tool: Tool; onBack: () => void }): JSX.Element {
  // Bumping the key remounts the tool so it re-reads its (now cleared) saved inputs.
  const [version, setVersion] = useState(0)
  const show = useToast((s) => s.show)
  const reset = (): void => {
    clearToolInputs(tool.id)
    setVersion((v) => v + 1)
    show({ message: `${tool.name} 입력값을 지웠습니다.` })
  }
  const G = GROUPS[tool.group]
  return (
    <article style={toolVars(tool.group)} className="mx-auto max-w-5xl animate-view-in px-8 pb-12 pt-5">
      <div className="mb-4 flex items-center gap-1 text-[12px] text-muted-foreground">
        <button onClick={onBack} className="-ml-2 flex h-7 items-center gap-0.5 rounded-md px-2 hover:bg-accent hover:text-foreground">
          <ChevronLeft className="h-3.5 w-3.5" /> 모든 도구
        </button>
        <span aria-hidden>/</span>
        <span className="px-1">{G.name}</span>
      </div>
      <header className="mb-7 flex items-center gap-3.5">
        <span className="tool-badge flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
          <tool.icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[24px] font-semibold leading-tight tracking-[-0.035em]">{tool.name}</h2>
          <p className="text-[13px] text-muted-foreground">{tool.blurb}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={reset} className="text-muted-foreground" title="이 도구의 입력값을 모두 지웁니다">
          <RotateCcw className="h-3.5 w-3.5" /> 초기화
        </Button>
      </header>
      <tool.Component key={version} />
    </article>
  )
}
