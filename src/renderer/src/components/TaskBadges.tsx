import { CalendarClock } from 'lucide-react'
import { PRIORITY_META, formatDue } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Priority } from '@shared/types'

export function PriorityBadge({ priority }: { priority: Priority }): JSX.Element | null {
  if (priority === 0) return null
  const meta = PRIORITY_META[priority]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium',
        meta.className
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
      {meta.label}
    </span>
  )
}

export function DueBadge({ due }: { due: string | null }): JSX.Element | null {
  const meta = formatDue(due)
  if (!meta) return null
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium',
        meta.tone === 'overdue' && 'bg-rose-500/15 text-rose-300',
        meta.tone === 'soon' && 'bg-amber-500/15 text-amber-300',
        meta.tone === 'normal' && 'bg-muted text-muted-foreground'
      )}
    >
      <CalendarClock className="h-3 w-3" />
      {meta.label}
    </span>
  )
}
