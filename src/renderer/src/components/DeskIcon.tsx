import { cn } from '@/lib/utils'

interface DeskIconProps {
  color: string
  /** Emoji; empty string renders the colored dot instead. */
  icon?: string
  /** Diameter token. sm = sidebar/header dot, md = larger affordance. */
  size?: 'sm' | 'md'
  className?: string
}

const DOT = { sm: 'h-3 w-3', md: 'h-3.5 w-3.5' }
const EMOJI = { sm: 'text-[13px] leading-none', md: 'text-[15px] leading-none' }

/** A desk's visual marker: a chosen emoji, or a colored dot when no emoji is set. */
export function DeskIcon({ color, icon, size = 'sm', className }: DeskIconProps): JSX.Element {
  if (icon) {
    return (
      <span className={cn('shrink-0 select-none', EMOJI[size], className)} aria-hidden>
        {icon}
      </span>
    )
  }
  return (
    <span
      className={cn('shrink-0 rounded-full', DOT[size], className)}
      style={{ backgroundColor: color }}
      aria-hidden
    />
  )
}
