import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Ban, Pipette, Smile } from 'lucide-react'
import { SWATCH_GROUPS, SWATCHES, EMOJI_GROUPS, DESK_EMOJIS, firstGrapheme } from '@/lib/palette'
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

const WIDTH = 304 // w-[19rem]

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
  const [tab, setTab] = useState(() => Math.max(0, EMOJI_GROUPS.findIndex((g) => g.items.includes(icon ?? ''))))
  const customColorRef = useRef<HTMLInputElement>(null)
  const emojiInputRef = useRef<HTMLInputElement>(null)
  const isCustomColor = !SWATCHES.includes(color)
  const isCustomIcon = !!icon && !DESK_EMOJIS.includes(icon)

  // Commit the native color picker on 'change' (closed), not on every 'input' tick while dragging.
  useEffect(() => {
    const el = customColorRef.current
    if (!el) return
    const commit = (): void => onChange({ color: el.value })
    el.addEventListener('change', commit)
    return () => el.removeEventListener('change', commit)
  }, [onChange, pos])

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
        className="glass-overlay fixed z-50 w-[19rem] origin-top-left animate-pop-in rounded-lg p-2.5"
        style={{ top: pos.top, left: pos.left }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-1.5 px-0.5 text-[11px] font-medium text-muted-foreground">색상</p>
        <div className="space-y-1">
          {SWATCH_GROUPS.map((g) => (
            <div key={g.label} className="grid grid-cols-12 gap-1" role="group" aria-label={g.label}>
              {g.items.map((c) => (
                <button
                  key={c}
                  title={`${g.label} ${c}`}
                  aria-label={`${g.label} ${c}`}
                  onClick={() => onChange({ color: c })}
                  className="flex aspect-square w-full items-center justify-center rounded-full transition-transform hover:scale-110"
                  style={{ backgroundColor: c }}
                >
                  {c === color && <Check className="h-3 w-3 text-white" />}
                </button>
              ))}
            </div>
          ))}
        </div>
        <label
          className={cn(
            'mt-2 flex h-7 cursor-pointer items-center gap-2 rounded-md px-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
            isCustomColor && 'bg-accent text-foreground'
          )}
        >
          <span className="h-4 w-4 shrink-0 rounded-full ring-1 ring-border" style={{ backgroundColor: color }} />
          <Pipette className="h-3.5 w-3.5" />
          직접 선택
          <span className="ml-auto font-mono text-[11px] uppercase">{color}</span>
          <input ref={customColorRef} type="color" defaultValue={color} className="sr-only" />
        </label>

        {showIcon && (
          <>
            <div className="mb-1.5 mt-3 flex items-center justify-between px-0.5">
              <p className="text-[11px] font-medium text-muted-foreground">아이콘</p>
              <button
                title="아이콘 없음 (색상 점)"
                onClick={() => onChange({ icon: '' })}
                className={cn(
                  'flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent',
                  icon === '' && 'bg-accent text-foreground ring-1 ring-ring'
                )}
              >
                <Ban className="h-3 w-3" />
                없음
              </button>
            </div>
            <div className="mb-1.5 flex gap-0.5" role="tablist">
              {EMOJI_GROUPS.map((g, i) => (
                <button
                  key={g.label}
                  role="tab"
                  aria-selected={tab === i}
                  onClick={() => setTab(i)}
                  className={cn(
                    'flex-1 rounded-md py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                    tab === i && 'bg-accent font-medium text-foreground'
                  )}
                >
                  {g.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-10 gap-0.5" role="tabpanel">
              {EMOJI_GROUPS[tab].items.map((e) => (
                <button
                  key={e}
                  onClick={() => onChange({ icon: e })}
                  className={cn(
                    'flex aspect-square w-full items-center justify-center rounded-md text-base transition-colors hover:bg-accent',
                    icon === e && 'bg-accent ring-1 ring-ring'
                  )}
                >
                  {e}
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-1">
              <input
                ref={emojiInputRef}
                placeholder="이모지·글자 직접 입력"
                aria-label="아이콘 직접 입력"
                onChange={(e) => {
                  if ((e.nativeEvent as InputEvent).isComposing) return // 한글 IME 조합 중
                  const g = firstGrapheme(e.target.value)
                  if (g) onChange({ icon: g })
                  e.target.value = ''
                }}
                onCompositionEnd={(e) => {
                  const g = firstGrapheme(e.currentTarget.value)
                  if (g) onChange({ icon: g })
                  e.currentTarget.value = ''
                }}
                className={cn(
                  'h-7 min-w-0 flex-1 rounded-md border border-input bg-background/70 px-2 text-xs outline-none focus:ring-2 focus:ring-ring',
                  isCustomIcon && 'ring-1 ring-ring'
                )}
              />
              <button
                title="전체 이모지 (시스템 이모지 패널)"
                aria-label="시스템 이모지 패널 열기"
                onClick={() => {
                  emojiInputRef.current?.focus()
                  void window.api.showEmojiPanel()
                }}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Smile className="h-4 w-4" />
              </button>
            </div>
          </>
        )}
      </div>
    </>,
    document.body
  )
}
