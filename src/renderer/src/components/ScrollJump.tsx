import { useEffect, useRef, useState } from 'react'
import { ArrowDownToLine, ArrowUpToLine } from 'lucide-react'
import { cn } from '@/lib/utils'

// Shown once the content is at least this many viewports tall — short memos stay uncluttered.
const LONG_RATIO = 1.5
// Within this many px of an end counts as being there.
const EDGE_PX = 8

interface ScrollState {
  isLong: boolean
  atTop: boolean
  atBottom: boolean
}

/**
 * Floating "맨 위로 / 맨 아래로" buttons for a long scroll area.
 * Render as the last child of the scrolling element; it pins itself to that element's bottom-right.
 * `className` adjusts the offset, e.g. to clear the window's floating tools button.
 */
export function ScrollJump({ className }: { className?: string }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<ScrollState>({ isLong: false, atTop: true, atBottom: false })

  useEffect(() => {
    const scroller = ref.current?.parentElement
    if (!scroller) return
    const measure = (): void => {
      const { scrollTop, scrollHeight, clientHeight } = scroller
      setState({
        isLong: scrollHeight > clientHeight * LONG_RATIO,
        atTop: scrollTop <= EDGE_PX,
        atBottom: scrollTop + clientHeight >= scrollHeight - EDGE_PX
      })
    }
    measure()
    // The scroller's own size and its content's height (typing, images loading) both matter.
    const ro = new ResizeObserver(measure)
    ro.observe(scroller)
    for (const child of Array.from(scroller.children)) ro.observe(child)
    scroller.addEventListener('scroll', measure, { passive: true })
    return () => {
      ro.disconnect()
      scroller.removeEventListener('scroll', measure)
    }
  }, [])

  const jump = (to: 'top' | 'bottom'): void => {
    const scroller = ref.current?.parentElement
    if (!scroller) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    scroller.scrollTo({ top: to === 'top' ? 0 : scroller.scrollHeight, behavior: reduced ? 'auto' : 'smooth' })
  }

  const button = 'flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-[color,background-color,opacity] duration-fast hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-35'

  return (
    // Zero-height sticky anchor: never adds space after the content, buttons hang above it.
    <div ref={ref} className="pointer-events-none sticky bottom-0 z-10 h-0">
      {state.isLong && (
        <div
          role="group"
          aria-label="스크롤 이동"
          className={cn(
            'pointer-events-auto absolute bottom-4 right-4 flex flex-col rounded-full border border-border bg-background/85 p-0.5 shadow-sm backdrop-blur',
            className
          )}
        >
          <button type="button" title="맨 위로" aria-label="맨 위로" disabled={state.atTop} onClick={() => jump('top')} className={button}>
            <ArrowUpToLine className="h-4 w-4" />
          </button>
          <button type="button" title="맨 아래로" aria-label="맨 아래로" disabled={state.atBottom} onClick={() => jump('bottom')} className={button}>
            <ArrowDownToLine className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}
