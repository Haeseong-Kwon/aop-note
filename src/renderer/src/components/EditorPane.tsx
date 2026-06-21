import { Bold, Italic, Code, Heading1, Heading2, List, ListChecks, Quote, Link2 } from 'lucide-react'
import { useMarkdownEditor } from '@/hooks/useMarkdownEditor'
import { SlashMenu } from './SlashMenu'
import { cn } from '@/lib/utils'

interface EditorPaneProps {
  value: string
  onChange: (next: string) => void
  onBlur?: () => void
  autoFocus?: boolean
  className?: string
}

/**
 * Markdown source editor with a formatting toolbar plus Notion-style conveniences:
 * a slash (/) block menu, auto-continued lists, Tab indentation, and shortcuts
 * (⌘B / ⌘I / ⌘E / ⌘K).
 */
export function EditorPane({
  value,
  onChange,
  onBlur,
  autoFocus,
  className
}: EditorPaneProps): JSX.Element {
  const { textareaRef, slash, setActiveIndex, selectBlock, handleChange, handleKeyDown, format } =
    useMarkdownEditor(value, onChange)

  const tools = [
    { icon: Bold, title: '굵게 (⌘B)', fn: format.bold },
    { icon: Italic, title: '기울임 (⌘I)', fn: format.italic },
    { icon: Code, title: '코드 (⌘E)', fn: format.code },
    { icon: Heading1, title: '제목 1', fn: format.h1 },
    { icon: Heading2, title: '제목 2', fn: format.h2 },
    { icon: List, title: '목록', fn: format.bullet },
    { icon: ListChecks, title: '체크리스트', fn: format.checklist },
    { icon: Quote, title: '인용', fn: format.quote },
    { icon: Link2, title: '링크 (⌘K)', fn: format.link }
  ]

  return (
    <div className={cn('relative flex min-h-0 flex-col', className)}>
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
        <span className="ml-auto mr-1 hidden text-[11px] text-muted-foreground sm:inline">
          <kbd className="rounded bg-muted px-1">/</kbd> 블록 삽입
        </span>
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        autoFocus={autoFocus}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={onBlur}
        placeholder="메모를 작성하세요.  '/' 입력 → 블록 삽입,  # 제목,  - 목록,  - [ ] 할 일,  **굵게**,  `코드` …"
        className="min-h-0 flex-1 resize-none rounded-b-md border border-input bg-background p-3 font-mono text-sm leading-relaxed outline-none focus:ring-2 focus:ring-ring"
      />
      {slash && (
        <SlashMenu
          items={slash.items}
          activeIndex={slash.activeIndex}
          top={slash.top}
          left={slash.left}
          onSelect={selectBlock}
          onHover={setActiveIndex}
        />
      )}
    </div>
  )
}
