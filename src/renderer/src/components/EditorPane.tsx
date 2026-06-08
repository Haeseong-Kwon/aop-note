import { useRef } from 'react'
import { Bold, Italic, Code, Heading1, Heading2, List, ListChecks, Quote, Link2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EditorPaneProps {
  value: string
  onChange: (next: string) => void
  onBlur?: () => void
  autoFocus?: boolean
  className?: string
}

/** Markdown source editor with a lightweight formatting toolbar. */
export function EditorPane({ value, onChange, onBlur, autoFocus, className }: EditorPaneProps): JSX.Element {
  const ref = useRef<HTMLTextAreaElement>(null)

  const apply = (transform: (sel: string) => { text: string; selStart: number; selEnd: number }): void => {
    const ta = ref.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selected = value.slice(start, end)
    const { text, selStart, selEnd } = transform(selected)
    const next = value.slice(0, start) + text + value.slice(end)
    onChange(next)
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(start + selStart, start + selEnd)
    })
  }

  const surround = (before: string, after: string, placeholder: string) => (): void =>
    apply((sel) => {
      const body = sel || placeholder
      return { text: `${before}${body}${after}`, selStart: before.length, selEnd: before.length + body.length }
    })

  const prefixLines = (prefix: string, placeholder: string) => (): void =>
    apply((sel) => {
      const body = sel || placeholder
      const text = body
        .split('\n')
        .map((l) => `${prefix}${l}`)
        .join('\n')
      return { text, selStart: prefix.length, selEnd: text.length }
    })

  const link = (): void =>
    apply((sel) => {
      const body = sel || '링크 텍스트'
      const text = `[${body}](url)`
      return { text, selStart: text.length - 4, selEnd: text.length - 1 }
    })

  const tools = [
    { icon: Bold, title: '굵게', fn: surround('**', '**', '굵게') },
    { icon: Italic, title: '기울임', fn: surround('*', '*', '기울임') },
    { icon: Code, title: '코드', fn: surround('`', '`', 'code') },
    { icon: Heading1, title: '제목 1', fn: prefixLines('# ', '제목') },
    { icon: Heading2, title: '제목 2', fn: prefixLines('## ', '제목') },
    { icon: List, title: '목록', fn: prefixLines('- ', '항목') },
    { icon: ListChecks, title: '체크리스트', fn: prefixLines('- [ ] ', '할 일') },
    { icon: Quote, title: '인용', fn: prefixLines('> ', '인용') },
    { icon: Link2, title: '링크', fn: link }
  ]

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="flex flex-wrap items-center gap-0.5 rounded-t-md border border-b-0 border-input bg-muted/40 px-1 py-1">
        {tools.map(({ icon: Icon, title, fn }) => (
          <button
            key={title}
            type="button"
            title={title}
            onMouseDown={(e) => e.preventDefault()} // keep textarea selection
            onClick={fn}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
      <textarea
        ref={ref}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder="마크다운으로 메모를 작성하세요. # 제목, - 목록, - [ ] 할 일, **굵게**, `코드` …"
        className="min-h-0 flex-1 resize-none rounded-b-md border border-input bg-background p-3 font-mono text-sm leading-relaxed outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  )
}
