import { useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { clampWidth, parseStoredWidth, type WidthLimits } from '@/lib/paneWidth'

const KEY_STEP = 16

function loadWidth(id: string, limits: WidthLimits): number {
  try {
    return parseStoredWidth(localStorage.getItem(`aop-pane:${id}`), limits)
  } catch {
    return limits.fallback
  }
}

function saveWidth(id: string, width: number): void {
  try {
    localStorage.setItem(`aop-pane:${id}`, String(width))
  } catch {
    /* storage unavailable: the width just isn't remembered */
  }
}

interface ResizablePaneProps extends WidthLimits {
  /** Remembers the width under this id. */
  id: string
  /** Never take more than this share of the row, so the content beside it keeps room
   *  when the window is small (the stored width is kept and returns when there's space). */
  maxShare?: number
  /** Read by screen readers: "<label> 너비 조절". */
  label: string
  as?: 'aside' | 'section' | 'nav' | 'div'
  className?: string
  children: ReactNode
  'aria-label'?: string
}

/**
 * A side pane whose right edge can be dragged to resize it (double-click resets,
 * ←/→ on the focused edge nudges). The width persists per `id`.
 */
export function ResizablePane({
  id,
  label,
  min,
  max,
  fallback,
  maxShare = 0.45,
  as: Tag = 'div',
  className,
  children,
  ...rest
}: ResizablePaneProps): JSX.Element {
  const limits = { min, max, fallback }
  const [width, setWidth] = useState(() => loadWidth(id, limits))
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ x: number; start: number } | null>(null)

  const commit = (next: number): void => {
    const clamped = clampWidth(next, limits)
    setWidth(clamped)
    saveWidth(id, clamped)
  }

  const endDrag = (): void => {
    if (!drag.current) return
    drag.current = null
    setDragging(false)
    document.body.classList.remove('is-resizing')
    saveWidth(id, width)
  }

  return (
    // The handle lives on an unclipped wrapper: panes like the sidebar clip their overflow
    // (rounded glass), which would cut off the half of the handle that sits in the gap.
    <div className="relative flex shrink-0" style={{ width, maxWidth: `${maxShare * 100}%` }}>
      <Tag className={cn('min-w-0 flex-1', className)} aria-label={rest['aria-label']}>
        {children}
      </Tag>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={`${label} 너비 조절`}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={width}
        tabIndex={0}
        title="드래그해서 너비 조절 · 더블클릭하면 기본 크기"
        onPointerDown={(e) => {
          e.preventDefault()
          e.currentTarget.setPointerCapture(e.pointerId)
          // Start from what's on screen: maxShare may be holding the pane below its stored width.
          const shown = e.currentTarget.parentElement?.getBoundingClientRect().width ?? width
          drag.current = { x: e.clientX, start: clampWidth(shown, limits) }
          setDragging(true)
          document.body.classList.add('is-resizing')
        }}
        onPointerMove={(e) => {
          if (drag.current) setWidth(clampWidth(drag.current.start + e.clientX - drag.current.x, limits))
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => commit(fallback)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') commit(width - KEY_STEP)
          else if (e.key === 'ArrowRight') commit(width + KEY_STEP)
          else return
          e.preventDefault()
        }}
        className="no-drag group/resize absolute -right-1.5 top-0 z-20 flex h-full w-3 cursor-col-resize justify-center outline-none"
      >
        <span
          className={cn(
            'h-full w-0.5 rounded-full transition-colors',
            dragging ? 'bg-primary' : 'bg-transparent group-hover/resize:bg-primary/50 group-focus-visible/resize:bg-primary'
          )}
        />
      </div>
    </div>
  )
}
