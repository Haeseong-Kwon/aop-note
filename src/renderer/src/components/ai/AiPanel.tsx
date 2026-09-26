import { useEffect, useRef, useState } from 'react'
import { Sparkles, X, RotateCcw, ArrowDownToLine, Replace, Square } from 'lucide-react'
import { useAi } from '@/hooks/useAi'
import { MarkdownView } from '@/components/MarkdownView'
import { cn } from '@/lib/utils'
import type { AiAction } from '@shared/types'

export const AI_ACTION_LABEL: Partial<Record<AiAction, string>> = {
  summarize: '요약',
  improve: '문장 다듬기',
  shorter: '짧게',
  longer: '길게',
  continue: '이어 쓰기',
  action_items: '할 일 뽑기',
  translate_en: '영어로',
  translate_ko: '한국어로'
}

export interface AiPanelProps {
  /** What the AI works on: the selection, or the whole memo. */
  text: string
  /** Where "apply" puts the result. */
  mode: 'selection' | 'insert'
  /** Run this immediately (toolbar / page-menu shortcuts). */
  initialAction?: AiAction
  onApply: (markdown: string, how: 'replace' | 'below') => void
  onClose: () => void
}

/** Notion-AI style panel: pick an action or type a request, watch it stream, then apply. */
export function AiPanel({ text, mode, initialAction, onApply, onClose }: AiPanelProps): JSX.Element {
  const ai = useAi()
  const [instruction, setInstruction] = useState('')
  const [last, setLast] = useState<{ action: AiAction; instruction?: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const start = (action: AiAction, extra?: string): void => {
    setLast({ action, instruction: extra })
    void ai.run(action, { text, instruction: extra })
  }

  useEffect(() => {
    if (initialAction) start(initialAction)
    else inputRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const done = !ai.running && ai.text && !ai.error
  // The quick actions all transform existing text; with nothing written yet, only a request makes sense.
  const actions = text.trim() ? (Object.keys(AI_ACTION_LABEL) as AiAction[]) : []

  return (
    <div
      className="glass-overlay fixed bottom-6 left-1/2 z-50 w-[min(44rem,calc(100vw-3rem))] -translate-x-1/2 rounded-xl p-3 animate-in fade-in-0 slide-in-from-bottom-2"
      role="dialog"
      aria-label="AI"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 shrink-0 text-violet-500" />
        <form
          className="flex-1"
          onSubmit={(e) => {
            e.preventDefault()
            if (instruction.trim()) start('custom', instruction.trim())
          }}
        >
          <input
            ref={inputRef}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => e.nativeEvent.isComposing && e.stopPropagation()}
            placeholder={text.trim() ? 'AI에게 요청하기 (예: 표로 정리해줘, 더 공손하게)' : 'AI에게 쓰기 요청 (예: 주간 회의 안건 초안)'}
            aria-label="AI 요청"
            className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </form>
        {ai.running && (
          <button type="button" onClick={ai.cancel} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent">
            <Square className="h-3 w-3" />
            중지
          </button>
        )}
        <button type="button" aria-label="닫기" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-accent">
          <X className="h-4 w-4" />
        </button>
      </div>

      {!ai.text && !ai.running && !ai.error && actions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {actions.map((a) => (
            <button key={a} type="button" onClick={() => start(a)} className="rounded-full border border-border px-2.5 py-1 text-xs hover:bg-accent">
              {AI_ACTION_LABEL[a]}
            </button>
          ))}
        </div>
      )}

      {(ai.text || ai.running) && (
        <div className="mt-2 max-h-[45vh] overflow-y-auto rounded-lg bg-background/60 px-4 py-3">
          {ai.text ? <MarkdownView source={ai.text} /> : <p className="text-sm text-muted-foreground">생각하는 중…</p>}
          {ai.running && ai.text && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-violet-500/70 align-middle" />}
        </div>
      )}

      {ai.error && <p className="mt-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{ai.error}</p>}

      {(done || ai.error) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {done && mode === 'selection' && (
            <PanelButton primary onClick={() => onApply(ai.text, 'replace')}>
              <Replace className="h-3.5 w-3.5" />
              바꾸기
            </PanelButton>
          )}
          {done && (
            <PanelButton primary={mode === 'insert'} onClick={() => onApply(ai.text, 'below')}>
              <ArrowDownToLine className="h-3.5 w-3.5" />
              {mode === 'insert' ? '삽입' : '아래에 삽입'}
            </PanelButton>
          )}
          {last && (
            <PanelButton onClick={() => start(last.action, last.instruction)}>
              <RotateCcw className="h-3.5 w-3.5" />
              다시 시도
            </PanelButton>
          )}
          <span className="ml-auto text-[11px] text-muted-foreground">AI 결과는 틀릴 수 있어요. 적용 전에 확인하세요.</span>
        </div>
      )}
    </div>
  )
}

function PanelButton({ primary, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }): JSX.Element {
  return (
    <button
      type="button"
      className={cn(
        'flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors',
        primary ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'border border-border hover:bg-accent',
        className
      )}
      {...props}
    />
  )
}
