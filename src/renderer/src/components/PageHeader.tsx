import type { LucideIcon } from 'lucide-react'
import { SidebarExpandButton } from './Sidebar'

interface PageHeaderProps {
  icon: LucideIcon
  title: string
  count?: number
}

/** Header strip for pages outside a desk (smart views, trash, settings). */
export function PageHeader({ icon: Icon, title, count }: PageHeaderProps): JSX.Element {
  return (
    <div className="drag-region flex h-12 shrink-0 items-center gap-2 border-b border-border px-5">
      <SidebarExpandButton />
      <Icon className="h-4 w-4 text-primary" />
      <h1 className="text-sm font-semibold tracking-tight">{title}</h1>
      {count !== undefined && (
        <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">
          {count}
        </span>
      )}
    </div>
  )
}
