import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import type { EditorBlock } from '@/lib/editorBlocks'

interface SlashMenuProps {
  items: readonly EditorBlock[]
  activeIndex: number
  top: number
  left: number
  onSelect: (block: EditorBlock) => void
  onHover: (index: number) => void
}

/** Block-picker popup anchored at the caret. Navigation is driven by the textarea. */
export function SlashMenu({
  items,
  activeIndex,
  top,
  left,
  onSelect,
  onHover
}: SlashMenuProps): JSX.Element | null {
  const activeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  if (items.length === 0) return null

  return (
    <div
      className="absolute z-50 max-h-60 w-56 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-xl"
      style={{ top, left }}
      // Keep textarea focus; selection happens via click handler.
      onMouseDown={(e) => e.preventDefault()}
    >
      {items.map((block, i) => {
        const Icon = block.icon
        return (
          <button
            key={block.id}
            ref={i === activeIndex ? activeRef : undefined}
            onMouseEnter={() => onHover(i)}
            onClick={() => onSelect(block)}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors',
              i === activeIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
            )}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background">
              <Icon className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm">{block.label}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{block.hint}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
