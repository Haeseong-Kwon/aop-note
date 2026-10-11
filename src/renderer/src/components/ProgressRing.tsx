import { cn } from '@/lib/utils'
import type { GoalPace } from '@shared/goalPace'

const TONE: Record<GoalPace | 'none', string> = {
  done: 'text-emerald-500',
  ahead: 'text-desk',
  on_track: 'text-desk',
  none: 'text-desk',
  behind: 'text-amber-500',
  overdue: 'text-rose-500'
}

/** Circular progress (0..1) tinted by pace; the track stays visible even at 0%. */
export function ProgressRing({
  value,
  pace,
  size = 20,
  className
}: {
  value: number
  pace: GoalPace | null
  size?: number
  className?: string
}): JSX.Element {
  const stroke = size <= 20 ? 2.5 : 3
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(1, value))
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className={cn('-rotate-90 shrink-0', TONE[pace ?? 'none'], className)}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity={0.18} strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - clamped)}
        className="transition-[stroke-dashoffset] duration-slow ease-out"
      />
    </svg>
  )
}
