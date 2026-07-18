import { useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Ban } from 'lucide-react'
import { SWATCHES, DESK_EMOJIS } from '@/lib/palette'
import { cn } from '@/lib/utils'

interface StylePickerProps {
  /** The trigger element the popover anchors beneath. */
  anchorEl: HTMLElement | null
  color: string
  /** Current emoji; undefined hides the emoji section (color-only mode). */
  icon?: string
  onChange: (next: { color?: string; icon?: string }) => void
  onClose: () => void
}

const WIDTH = 208 // w-52

/**
 * Floating color (+ optional emoji) picker, portaled to the body so it is never
 * clipped by a scrolling panel. Anchored beneath its trigger element.
 */
export function StylePicker({
  anchorEl,
  color,
  icon,
  onChange,
  onClose
}: StylePickerProps): JSX.Element | null {
  const showIcon = icon !== undefined
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!anchorEl) return
    const r = anchorEl.getBoundingClientRect()
    const left = Math.min(r.left, window.innerWidth - WIDTH - 8)
    setPos({ top: r.bottom + 6, left: Math.max(8, left) })
  }, [anchorEl])

  if (!pos) return null

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="glass-overlay fixed z-50 w-52 rounded-lg p-2.5"
        style={{ top: pos.top, left: pos.left }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-1.5 px-0.5 text-[11px] font-medium text-muted-foreground">색상</p>
        <div className="grid grid-cols-6 gap-1.5">
          {SWATCHES.map((c) => (
            <button
              key={c}
              title={c}
              onClick={() => onChange({ color: c })}
              className="flex h-6 w-6 items-center justify-center rounded-full transition-transform hover:scale-110"
              style={{ backgroundColor: c }}
            >
              {c === color && <Check className="h-3.5 w-3.5 text-white" />}
            </button>
          ))}
        </div>

        {showIcon && (
          <>
            <p className="mb-1.5 mt-3 px-0.5 text-[11px] font-medium text-muted-foreground">아이콘</p>
            <div className="grid grid-cols-6 gap-1">
              <button
                title="아이콘 없음 (색상 점)"
                onClick={() => onChange({ icon: '' })}
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent',
                  icon === '' && 'bg-accent ring-1 ring-ring'
                )}
              >
                <Ban className="h-3.5 w-3.5" />
              </button>
              {DESK_EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => onChange({ icon: e })}
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-md text-base transition-colors hover:bg-accent',
                    icon === e && 'bg-accent ring-1 ring-ring'
                  )}
                >
                  {e}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </>,
    document.body
  )
}
