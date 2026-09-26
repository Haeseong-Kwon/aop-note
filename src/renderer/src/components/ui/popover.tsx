import { useLayoutEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

interface PopoverProps {
  anchorEl: HTMLElement | null
  onClose: () => void
  width: number
  /** Right-align to the anchor (menus at the right edge of a header). */
  align?: 'left' | 'right'
  className?: string
  children: ReactNode
}

/** Floating panel portaled to <body> under its trigger; click outside or Esc closes it. */
export function Popover({ anchorEl, onClose, width, align = 'left', className, children }: PopoverProps): JSX.Element | null {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!anchorEl) return
    const r = anchorEl.getBoundingClientRect()
    const wanted = align === 'right' ? r.right - width : r.left
    setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(wanted, window.innerWidth - width - 8)) })
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [anchorEl, align, width, onClose])

  if (!pos) return null
  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        role="dialog"
        className={cn('glass-overlay fixed z-50 rounded-lg p-2.5', className)}
        style={{ top: pos.top, left: pos.left, width }}
      >
        {children}
      </div>
    </>,
    document.body
  )
}
