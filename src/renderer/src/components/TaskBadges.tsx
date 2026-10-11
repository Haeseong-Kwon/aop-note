import { useEffect, useRef } from 'react'
import { CalendarClock } from 'lucide-react'
import { PRIORITY_META, formatDue } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Priority } from '@shared/types'

const BAR_TONE: Record<Priority, string> = {
  0: 'bg-muted-foreground/25',
  1: 'bg-sky-500',
  2: 'bg-amber-500',
  3: 'bg-rose-500'
}

/** Priority as three rising bars (filled up to the level) — reads at a glance, no label noise. */
export function PriorityGlyph({ priority, className }: { priority: Priority; className?: string }): JSX.Element {
  return (
    <span aria-hidden className={cn('inline-flex h-3 items-end gap-[2px]', className)}>
      {[1, 2, 3].map((level) => (
        <span
          key={level}
          className={cn(
            'w-[3px] rounded-[1px] transition-colors duration-base',
            level <= priority ? BAR_TONE[priority] : 'bg-muted-foreground/20'
          )}
          style={{ height: `${4 + level * 2.5}px` }}
        />
      ))}
    </span>
  )
}

export function PriorityBadge({ priority }: { priority: Priority }): JSX.Element | null {
  if (priority === 0) return null
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
      <PriorityGlyph priority={priority} />
      {PRIORITY_META[priority].label}
    </span>
  )
}

/** Due date: plain tabular text normally; tinted only when it needs attention. */
export function DueBadge({ due }: { due: string | null }): JSX.Element | null {
  const meta = formatDue(due)
  if (!meta) return null
  return (
    <span
      className={cn(
        'tabular inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium',
        meta.tone === 'overdue' && 'bg-rose-500/12 text-rose-700 dark:text-rose-300',
        meta.tone === 'soon' && 'bg-amber-500/12 text-amber-700 dark:text-amber-300',
        meta.tone === 'normal' && 'text-muted-foreground'
      )}
    >
      <CalendarClock className="h-3 w-3 opacity-80" />
      {meta.label}
    </span>
  )
}

/** Round-ish checkbox that fills with the desk colour and draws its check mark. */
export function TaskCheck({ done, onToggle, label }: { done: boolean; onToggle: () => void; label: string }): JSX.Element {
  // Animate only the moment it becomes done — not every time a list of done tasks mounts.
  const was = useRef(done)
  const justDone = done && !was.current
  useEffect(() => {
    was.current = done
  }, [done])
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      role="checkbox"
      aria-checked={done}
      aria-label={label}
      title={done ? '완료 취소' : '완료'}
      className={cn(
        'group/check flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[6px] border transition-[background-color,border-color,transform] duration-base ease-out active:scale-90',
        done ? 'border-desk bg-desk text-white' : 'border-muted-foreground/35 hover:border-desk',
        justDone && 'animate-check-pop'
      )}
    >
      <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path
          d="M2.5 6.2 5 8.5 9.5 3.5"
          strokeDasharray={16}
          className={cn(done ? justDone && 'animate-check-draw' : 'text-desk opacity-0 group-hover/check:opacity-40')}
        />
      </svg>
    </button>
  )
}
