import { useEffect, useState, type ReactNode } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { ChevronLeft, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useNav } from './nav'

// Building blocks for the phone screens: a page top bar, list rows, and bottom sheets.

interface TopBarProps {
  title?: ReactNode
  /** Shows a back arrow that pops the page. */
  back?: boolean
  actions?: ReactNode
}

/** Pops the current page; nothing at a tab's root. */
export function BackButton(): JSX.Element | null {
  const canPop = useNav((s) => s.stacks[s.tab].length > 1)
  const pop = useNav((s) => s.pop)
  if (!canPop) return null
  return <IconButton icon={ChevronLeft} label="뒤로" onClick={() => pop()} className="-ml-2" iconClassName="h-6 w-6" />
}

export function TopBar({ title, back, actions }: TopBarProps): JSX.Element {
  const pop = useNav((s) => s.pop)
  return (
    <header className="flex h-14 shrink-0 items-center gap-1 border-b border-border/60 bg-background px-2">
      {back && <IconButton icon={ChevronLeft} label="뒤로" onClick={() => pop()} className="-ml-0.5" iconClassName="h-6 w-6" />}
      <div className={cn('flex min-w-0 flex-1 items-center gap-2 text-[17px] font-semibold', !back && 'pl-2')}>{title}</div>
      {actions && <div className="flex shrink-0 items-center">{actions}</div>}
    </header>
  )
}

interface IconButtonProps {
  icon: LucideIcon
  label: string
  onClick: () => void
  className?: string
  iconClassName?: string
}

export function IconButton({ icon: Icon, label, onClick, className, iconClassName }: IconButtonProps): JSX.Element {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={cn('flex h-11 w-11 items-center justify-center rounded-full text-foreground/80 active:bg-accent', className)}
    >
      <Icon className={cn('h-5 w-5', iconClassName)} />
    </button>
  )
}

interface RowProps {
  icon?: ReactNode
  label: ReactNode
  detail?: ReactNode
  trailing?: ReactNode
  onClick?: () => void
  indent?: number
  className?: string
}

/** A full-width tappable list row (48px), Notion-style: icon, label, optional detail line. */
export function Row({ icon, label, detail, trailing, onClick, indent = 0, className }: RowProps): JSX.Element {
  return (
    <div className={cn('flex min-h-12 items-center active:bg-accent/70', className)} style={{ paddingLeft: 16 + indent * 18 }}>
      <button onClick={onClick} className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pr-2 text-left">
        {icon && <span className="flex w-6 shrink-0 items-center justify-center text-muted-foreground">{icon}</span>}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px]">{label}</span>
          {detail && <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">{detail}</span>}
        </span>
      </button>
      {trailing && <div className="flex shrink-0 items-center pr-2">{trailing}</div>}
    </div>
  )
}

export function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }): JSX.Element {
  return (
    <div className="flex h-10 items-end justify-between px-4 pb-1.5">
      <h2 className="text-[13px] font-medium text-muted-foreground">{children}</h2>
      {action}
    </div>
  )
}

interface SheetProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}

/** A bottom sheet: slides up over a dim backdrop, closes on backdrop tap / back button. */
export function Sheet({ open, onClose, title, children }: SheetProps): JSX.Element {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-background pb-[max(env(safe-area-inset-bottom),12px)] shadow-2xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom"
        >
          <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-muted-foreground/30" aria-hidden />
          <DialogPrimitive.Title className={cn('px-5 pb-1 pt-3 text-[15px] font-semibold', !title && 'sr-only')}>
            {title ?? '메뉴'}
          </DialogPrimitive.Title>
          <div className="pt-1">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

interface SheetActionProps {
  icon: LucideIcon
  label: string
  onClick: () => void
  danger?: boolean
}

export function SheetAction({ icon: Icon, label, onClick, danger }: SheetActionProps): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={cn('flex h-[52px] w-full items-center gap-4 px-5 text-left text-[16px] active:bg-accent', danger && 'text-destructive')}
    >
      <Icon className="h-5 w-5 shrink-0 opacity-80" />
      {label}
    </button>
  )
}

interface PromptSheetProps {
  open: boolean
  title: string
  placeholder: string
  initial?: string
  submitLabel: string
  onSubmit: (value: string) => void
  onClose: () => void
}

/** A one-field form in a sheet (name a desk, rename a category...). */
export function PromptSheet({ open, title, placeholder, initial = '', submitLabel, onSubmit, onClose }: PromptSheetProps): JSX.Element {
  const [value, setValue] = useState(initial)
  useEffect(() => {
    if (open) setValue(initial)
  }, [open, initial])
  const submit = (): void => {
    if (!value.trim()) return
    onSubmit(value.trim())
    onClose()
  }
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <form
        className="flex gap-2 px-4 pb-2 pt-2"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="h-12 min-w-0 flex-1 rounded-xl border border-input bg-muted/40 px-4 text-[16px] outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          disabled={!value.trim()}
          className="h-12 shrink-0 rounded-xl bg-primary px-5 text-[15px] font-medium text-primary-foreground disabled:opacity-40"
        >
          {submitLabel}
        </button>
      </form>
    </Sheet>
  )
}

/** Horizontally scrolling pill choices (views, categories). */
export function Chips<T extends string>({
  items,
  value,
  onChange,
  trailing
}: {
  items: { value: T; label: ReactNode }[]
  value: T | null
  onChange: (value: T) => void
  trailing?: ReactNode
}): JSX.Element {
  return (
    <div className="no-scrollbar flex shrink-0 gap-2 overflow-x-auto px-4 py-2.5">
      {items.map((item) => (
        <button
          key={item.value}
          onClick={() => onChange(item.value)}
          aria-pressed={value === item.value}
          className={cn(
            'flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[14px] transition-colors',
            value === item.value
              ? 'border-transparent bg-foreground text-background'
              : 'border-border bg-background text-foreground/80 active:bg-accent'
          )}
        >
          {item.label}
        </button>
      ))}
      {trailing}
    </div>
  )
}
