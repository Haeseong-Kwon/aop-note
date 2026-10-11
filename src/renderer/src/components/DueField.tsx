import { useRef } from 'react'
import { CalendarDays, X } from 'lucide-react'
import { formatDue, toDateInput, fromDateInput } from '@/lib/format'
import { cn } from '@/lib/utils'

interface DueFieldProps {
  value: string | null
  onChange: (iso: string | null) => void
  className?: string
}

/**
 * A due date as a quiet button ("기한 추가" or the formatted date) that opens the
 * native date picker — instead of a bare <input type=date> showing "연도. 월. 일.".
 */
export function DueField({ value, onChange, className }: DueFieldProps): JSX.Element {
  const input = useRef<HTMLInputElement>(null)
  const meta = formatDue(value)
  const open = (): void => {
    const el = input.current
    if (!el) return
    try {
      el.showPicker()
    } catch {
      el.focus() // older engines: focusing still lets the keyboard edit the date
    }
  }
  return (
    <span className={cn('relative inline-flex items-center', className)}>
      <button
        type="button"
        onClick={open}
        className={cn(
          'tabular inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs transition-colors duration-fast hover:bg-accent',
          !meta && 'text-muted-foreground',
          meta?.tone === 'overdue' && 'text-rose-600 dark:text-rose-400',
          meta?.tone === 'soon' && 'text-amber-700 dark:text-amber-300'
        )}
      >
        <CalendarDays className="h-3.5 w-3.5" />
        {meta ? meta.label : '기한 추가'}
      </button>
      {meta && (
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label="기한 지우기"
          title="기한 지우기"
          className="ml-0.5 rounded p-0.5 text-muted-foreground/70 hover:bg-accent hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      )}
      <input
        ref={input}
        type="date"
        tabIndex={-1}
        aria-hidden
        value={toDateInput(value)}
        onChange={(e) => onChange(fromDateInput(e.target.value))}
        className="pointer-events-none absolute bottom-0 left-0 h-0 w-0 opacity-0"
      />
    </span>
  )
}
