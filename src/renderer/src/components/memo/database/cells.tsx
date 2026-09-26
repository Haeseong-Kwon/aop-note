import { useEffect, useRef, useState } from 'react'
import { Check, ExternalLink } from 'lucide-react'
import { Popover } from '@/components/ui/popover'
import { PRIORITY_META, STATUS_META, toDateInput, fromDateInput } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Priority, Property, PropertyValue, TaskStatus } from '@shared/types'

// Notion-ish select colours (tinted chip, readable in light and dark).
const OPTION_CLASS: Record<string, string> = {
  gray: 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
  brown: 'bg-amber-900/15 text-amber-900 dark:text-amber-200',
  orange: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
  yellow: 'bg-yellow-500/20 text-yellow-800 dark:text-yellow-200',
  green: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  blue: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  purple: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  pink: 'bg-pink-500/15 text-pink-700 dark:text-pink-300',
  red: 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
}

export function OptionChip({ name, color }: { name: string; color?: string }): JSX.Element {
  return <span className={cn('inline-block max-w-full truncate rounded px-1.5 py-0.5 text-xs', OPTION_CLASS[color ?? 'gray'] ?? OPTION_CLASS.gray)}>{name}</span>
}

const cellBase = 'flex min-h-[1.75rem] w-full items-center gap-1 rounded px-1.5 text-left text-sm hover:bg-accent/60'

/** Inline text / number / url editor: click to edit, Enter or blur commits, Esc cancels. */
function InlineInput({
  value,
  type,
  placeholder,
  onCommit
}: {
  value: string
  type: 'text' | 'number' | 'url'
  placeholder?: string
  onCommit: (v: string) => void
}): JSX.Element {
  const [draft, setDraft] = useState<string | null>(null)
  if (draft === null) {
    return (
      <button type="button" className={cn(cellBase, !value && 'text-muted-foreground/60')} onClick={() => setDraft(value)}>
        {type === 'url' && value ? (
          <>
            <span className="truncate text-primary underline underline-offset-2">{value.replace(/^https?:\/\//, '')}</span>
            <ExternalLink
              className="h-3 w-3 shrink-0 text-muted-foreground"
              onClick={(e) => {
                e.stopPropagation()
                window.open(value, '_blank')
              }}
            />
          </>
        ) : (
          <span className={cn('truncate', type === 'number' && 'ml-auto tabular-nums')}>{value || placeholder || '비어 있음'}</span>
        )}
      </button>
    )
  }
  const commit = (): void => {
    if (draft !== value) onCommit(draft)
    setDraft(null)
  }
  return (
    <input
      autoFocus
      type={type === 'number' ? 'number' : 'text'}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') setDraft(null)
      }}
      className="h-7 w-full rounded border border-input bg-background px-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
    />
  )
}

/** Pick one (select) or several (multi-select) options; typing a new name creates it. */
function OptionPicker({
  property,
  value,
  onChange
}: {
  property: Property
  value: PropertyValue | undefined
  onChange: (v: PropertyValue | null) => void
}): JSX.Element {
  const multi = property.type === 'multi_select'
  const selected = multi ? ((value as string[] | undefined) ?? []) : value ? [String(value)] : []
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLButtonElement>(null)
  const toggle = (name: string): void => {
    if (multi) {
      const next = selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name]
      onChange(next.length ? next : null)
    } else {
      onChange(selected[0] === name ? null : name)
      setOpen(false)
    }
  }
  const q = query.trim()
  const options = property.options.filter((o) => o.name.toLowerCase().includes(q.toLowerCase()))
  return (
    <>
      <button ref={ref} type="button" className={cn(cellBase, 'flex-wrap py-0.5')} onClick={() => setOpen(true)}>
        {selected.length === 0 && <span className="text-muted-foreground/60">비어 있음</span>}
        {selected.map((name) => (
          <OptionChip key={name} name={name} color={property.options.find((o) => o.name === name)?.color} />
        ))}
      </button>
      {open && (
        <Popover anchorEl={ref.current} onClose={() => setOpen(false)} width={240}>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return
              if (e.key === 'Enter' && q) {
                toggle(options.find((o) => o.name === q)?.name ?? q)
                setQuery('')
              }
            }}
            placeholder="검색하거나 새 옵션 입력"
            className="mb-1.5 h-8 w-full rounded-md border border-input bg-background/70 px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="max-h-56 overflow-y-auto">
            {options.map((o) => (
              <button
                key={o.name}
                type="button"
                onClick={() => toggle(o.name)}
                className="flex w-full items-center justify-between rounded px-1.5 py-1 hover:bg-accent"
              >
                <OptionChip name={o.name} color={o.color} />
                {selected.includes(o.name) && <Check className="h-3.5 w-3.5 text-muted-foreground" />}
              </button>
            ))}
            {q && !property.options.some((o) => o.name === q) && (
              <button
                type="button"
                onClick={() => {
                  toggle(q)
                  setQuery('')
                }}
                className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-sm hover:bg-accent"
              >
                <span className="text-muted-foreground">새 옵션</span> <OptionChip name={q} />
              </button>
            )}
          </div>
        </Popover>
      )}
    </>
  )
}

/** Display + edit a custom property value. */
export function PropertyCell({
  property,
  value,
  onChange
}: {
  property: Property
  value: PropertyValue | undefined
  onChange: (v: unknown) => void
}): JSX.Element {
  switch (property.type) {
    case 'checkbox':
      return (
        <button
          type="button"
          role="checkbox"
          aria-checked={value === true}
          aria-label={property.name}
          className={cn(cellBase, 'justify-center')}
          onClick={() => onChange(value === true ? null : true)}
        >
          <span
            className={cn(
              'flex h-4 w-4 items-center justify-center rounded border',
              value === true ? 'border-primary bg-primary text-primary-foreground' : 'border-input'
            )}
          >
            {value === true && <Check className="h-3 w-3" />}
          </span>
        </button>
      )
    case 'date':
      return (
        <input
          type="date"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value || null)}
          className={cn(
            'h-7 w-full rounded bg-transparent px-1.5 text-sm outline-none hover:bg-accent/60 focus:ring-2 focus:ring-ring',
            typeof value !== 'string' && 'text-transparent focus:text-foreground' // no "연도. 월. 일." noise
          )}
        />
      )
    case 'select':
    case 'multi_select':
      return <OptionPicker property={property} value={value} onChange={onChange} />
    default:
      return (
        <InlineInput
          type={property.type === 'number' ? 'number' : property.type === 'url' ? 'url' : 'text'}
          value={value === undefined ? '' : String(value)}
          onCommit={(v) => onChange(v.trim() === '' ? null : property.type === 'number' ? Number(v) : v)}
        />
      )
  }
}

export function StatusCell({ value, onChange }: { value: TaskStatus; onChange: (s: TaskStatus) => void }): JSX.Element {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as TaskStatus)}
      className={cn('h-7 w-full rounded bg-transparent px-1 text-xs outline-none hover:bg-accent/60', STATUS_META[value].className)}
    >
      {(['todo', 'doing', 'done'] as TaskStatus[]).map((s) => (
        <option key={s} value={s}>
          {STATUS_META[s].label}
        </option>
      ))}
    </select>
  )
}

export function PriorityCell({ value, onChange }: { value: Priority; onChange: (p: Priority) => void }): JSX.Element {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value) as Priority)}
      className={cn('h-7 w-full rounded bg-transparent px-1 text-xs outline-none hover:bg-accent/60', value === 0 && 'text-muted-foreground/70')}
    >
      {([0, 1, 2, 3] as Priority[]).map((p) => (
        <option key={p} value={p}>
          {PRIORITY_META[p].label}
        </option>
      ))}
    </select>
  )
}

export function DueCell({ value, onChange }: { value: string | null; onChange: (iso: string | null) => void }): JSX.Element {
  const [local, setLocal] = useState(toDateInput(value))
  useEffect(() => setLocal(toDateInput(value)), [value])
  return (
    <input
      type="date"
      value={local}
      onChange={(e) => {
        setLocal(e.target.value)
        onChange(fromDateInput(e.target.value))
      }}
      className={cn(
        'h-7 w-full rounded bg-transparent px-1.5 text-sm outline-none hover:bg-accent/60 focus:ring-2 focus:ring-ring',
        !local && 'text-transparent focus:text-foreground'
      )}
    />
  )
}
