import { useEffect, useState, type ChangeEvent, type ReactNode } from 'react'
import { Check, Copy, Plus, X } from 'lucide-react'
import { useToast } from '@/store/useToast'
import { groupDigits, koreanWon, num } from '@/lib/toolMath'
import { cn } from '@/lib/utils'

/** Prefix of every tool's saved inputs; the tool page's 초기화 clears `${TOOL_STORE}${toolId}.*`. */
export const TOOL_STORE = 'aop-tool:'

/** useState that survives switching tools / restarting. Keys are '<tool id>.<field>'. */
export function usePersistentState<T>(key: string, initial: T): [T, (v: T) => void] {
  const storageKey = TOOL_STORE + key
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      return raw === null ? initial : (JSON.parse(raw) as T)
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(value))
    } catch {
      /* not remembered */
    }
  }, [storageKey, value])
  return [value, setValue]
}

/** Inputs on the left, the readout on the right; stacks in a narrow pane. `wide`: table-style inputs get more room. */
export function ToolLayout({ inputs, readout, wide }: { inputs: ReactNode; readout: ReactNode; wide?: boolean }): JSX.Element {
  return (
    <div className={cn('tool-grid grid items-start gap-x-8 gap-y-6', wide && 'tool-grid-wide')}>
      <div className="flex min-w-0 flex-col gap-5">{inputs}</div>
      <div className="min-w-0">{readout}</div>
    </div>
  )
}

/**
 * Number input that groups digits as you type ("1,000,000") and keeps the caret
 * on the same digit, so editing the middle of a figure doesn't jump to the end.
 */
export function NumInput({ value, onChange, className, ...rest }: { value: string; onChange: (v: string) => void; className?: string; placeholder?: string; 'aria-label'?: string; autoFocus?: boolean }): JSX.Element {
  const handle = (e: ChangeEvent<HTMLInputElement>): void => {
    const el = e.target
    const caret = el.selectionStart ?? el.value.length
    const significant = el.value.slice(0, caret).replace(/[^\d.-]/g, '').length
    const next = groupDigits(el.value)
    onChange(next)
    requestAnimationFrame(() => {
      let pos = 0
      for (let seen = 0; pos < next.length && seen < significant; pos++) if (/[\d.-]/.test(next[pos])) seen++
      if (document.activeElement === el) el.setSelectionRange(pos, pos)
    })
  }
  return <input type="text" inputMode="decimal" autoComplete="off" value={value} onChange={handle} className={className} {...rest} />
}

interface FieldProps {
  label: string
  value: string
  onChange: (v: string) => void
  suffix?: string
  hint?: string
  placeholder?: string
  type?: 'number' | 'text' | 'date' | 'time'
  /** Money in 원: suffix 원 and the amount in Korean units under the field. */
  won?: boolean
}

const FIELD_BOX =
  'flex h-11 items-center rounded-xl border border-input bg-background/80 shadow-[inset_0_1px_2px_hsl(var(--foreground)/0.04)] transition-[box-shadow,border-color] duration-fast hover:border-[color:var(--tool-line)] focus-within:border-[color:var(--tool)] focus-within:shadow-[0_0_0_3px_var(--tool-soft)]'

/** A labelled input; numbers stay strings so the field can be empty mid-edit. */
export function Field({ label, value, onChange, suffix, hint, placeholder, type = 'number', won }: FieldProps): JSX.Element {
  const n = num(value)
  const wonHint = won && Number.isFinite(n) && Math.abs(n) >= 10_000 ? koreanWon(n) : undefined
  const inputClass = 'h-full min-w-0 flex-1 bg-transparent px-3.5 text-[15px] tabular-nums outline-none placeholder:text-muted-foreground/45'
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[12px] font-medium text-muted-foreground">{label}</span>
      <span className={FIELD_BOX}>
        {type === 'number' ? (
          <NumInput value={value} onChange={onChange} placeholder={placeholder} className={inputClass} />
        ) : (
          <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={inputClass} />
        )}
        {(suffix ?? (won ? '원' : undefined)) && <span className="pr-3.5 text-[13px] text-muted-foreground">{suffix ?? '원'}</span>}
      </span>
      {(wonHint || hint) && <span className="text-[11.5px] text-muted-foreground/85">{wonHint ?? hint}</span>}
    </label>
  )
}

export function FieldRow({ children }: { children: ReactNode }): JSX.Element {
  return <div className="grid grid-cols-2 gap-3">{children}</div>
}

/** A titled group of fields, for tools with several kinds of input. */
export function FieldGroup({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <fieldset className="flex flex-col gap-3 rounded-2xl border border-border/80 p-4">
      <legend className="-ml-1 px-1 text-[12px] font-semibold text-foreground/80">{title}</legend>
      {children}
    </fieldset>
  )
}

interface SegmentedProps<T extends string> {
  value: T
  options: readonly (readonly [T, string])[]
  onChange: (v: T) => void
  label: string
}

export function Segmented<T extends string>({ value, options, onChange, label }: SegmentedProps<T>): JSX.Element {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-xl bg-muted/70 p-1 text-[13px]">
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn(
            'h-8 flex-1 whitespace-nowrap rounded-lg px-2.5 transition-all duration-fast',
            value === v ? 'bg-background font-semibold text-[color:var(--tool)] shadow-sm' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {text}
        </button>
      ))}
    </div>
  )
}

/** Shown in the readout when inputs are incomplete or invalid. */
export const EMPTY = '—'

export function CopyButton({ text, label = '결과 복사' }: { text: string; label?: string }): JSX.Element {
  const show = useToast((s) => s.show)
  const [done, setDone] = useState(false)
  const copy = (): void => {
    void navigator.clipboard.writeText(text).then(
      () => {
        setDone(true)
        setTimeout(() => setDone(false), 1200)
        show({ message: '복사했습니다' })
      },
      () => show({ message: '복사하지 못했습니다. 다시 시도하세요.' })
    )
  }
  return (
    <button onClick={copy} title={label} aria-label={label} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-background/70 hover:text-foreground">
      {done ? <Check className="h-3.5 w-3.5 text-[color:var(--tool)]" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

/**
 * The instrument panel: a tinted plate on graph-paper texture, with the headline figure large.
 * Everything else in a tool stays quiet so this reads first. Empty inputs show a muted placeholder.
 */
export function Readout({ label, value, unit, sub, children, emptyHint = '값을 입력하면 바로 계산합니다' }: { label: string; value: string; unit?: string; sub?: string; children?: ReactNode; emptyHint?: string }): JSX.Element {
  const empty = value === EMPTY || value === ''
  return (
    <section aria-label={label} className="tool-plate rounded-[1.25rem] p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[12px] font-semibold text-[color:var(--tool)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--tool)]" />
          {label}
        </span>
        {!empty && <CopyButton text={value} />}
      </div>
      <output className="mt-2 flex flex-wrap items-baseline gap-x-1.5">
        <span key={empty ? 'empty' : 'value'} className={cn('tool-figure animate-pop-in break-all', empty && 'text-muted-foreground/30')}>
          {empty ? '0' : value}
        </span>
        {unit && <span className={cn('text-base font-medium', empty ? 'text-muted-foreground/40' : 'text-muted-foreground')}>{unit}</span>}
      </output>
      <p className="mt-1 min-h-[1.25rem] text-[13px] text-muted-foreground">{empty ? emptyHint : sub}</p>
      {children && <div className="mt-4 border-t border-dashed border-[color:var(--tool-line)] pt-3">{children}</div>}
    </section>
  )
}

export function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }): JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-[13px]">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('text-right tabular-nums', value === EMPTY ? 'text-muted-foreground/50' : strong && 'font-semibold')}>{value}</span>
    </div>
  )
}

/** Proportions of a whole as one stacked bar with a legend (e.g. principal vs interest). */
export function SplitBar({ parts }: { parts: { label: string; value: number; color: string }[] }): JSX.Element {
  const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0) || 1
  return (
    <div className="mt-2">
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
        {parts.map((p) => (
          <span key={p.label} className="h-full rounded-full transition-[width] duration-slow" style={{ width: `${(Math.max(0, p.value) / total) * 100}%`, backgroundColor: p.color }} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
        {parts.map((p) => (
          <span key={p.label} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: p.color }} />
            {p.label} {Math.round((Math.max(0, p.value) / total) * 100)}%
          </span>
        ))}
      </div>
    </div>
  )
}

export function Note({ children }: { children: ReactNode }): JSX.Element {
  return <p className="text-[12px] leading-relaxed text-muted-foreground">{children}</p>
}

/** A plate for results that aren't one figure (lists, clocks, rankings). */
export function Plate({ label, children, action, className }: { label?: string; children: ReactNode; action?: ReactNode; className?: string }): JSX.Element {
  return (
    <section aria-label={label} className={cn('tool-plate rounded-[1.25rem] p-5', className)}>
      {(label || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {label && (
            <span className="flex items-center gap-1.5 text-[12px] font-semibold text-[color:var(--tool)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--tool)]" />
              {label}
            </span>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

// --- List-style tools (rows the user adds / removes) -------------------------------------

export const newRowId = (): string => crypto.randomUUID().slice(0, 8)

/** A compact cell input (wide = the name column; otherwise a grouped number). */
export function RowInput({ value, onChange, label, wide, placeholder }: { value: string; onChange: (v: string) => void; label: string; wide?: boolean; placeholder?: string }): JSX.Element {
  const cls = 'field h-9 rounded-lg tabular-nums placeholder:text-muted-foreground/40 focus:border-[color:var(--tool)] focus:shadow-[0_0_0_3px_var(--tool-soft)]'
  return wide ? (
    <input value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} placeholder={placeholder ?? label} className={cn(cls, 'min-w-[6rem] flex-1')} />
  ) : (
    <NumInput value={value} onChange={onChange} aria-label={label} placeholder={placeholder} className={cn(cls, 'w-16 text-right')} />
  )
}

export function RemoveButton({ onClick, disabled, label = '삭제' }: { onClick: () => void; disabled?: boolean; label?: string }): JSX.Element {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/70 transition hover:bg-accent hover:text-foreground disabled:opacity-25">
      <X className="h-3.5 w-3.5" />
    </button>
  )
}

export function AddButton({ onClick, label }: { onClick: () => void; label: string }): JSX.Element {
  return (
    <button onClick={onClick} className="flex h-9 items-center justify-center gap-1 rounded-lg border border-dashed border-border text-[13px] text-muted-foreground transition-colors hover:border-[color:var(--tool)] hover:bg-[color:var(--tool-soft)] hover:text-[color:var(--tool)]">
      <Plus className="h-3.5 w-3.5" /> {label}
    </button>
  )
}

/** Column headings above RowInput rows; `cols` are the numeric columns' labels (right-aligned, w-16). */
export function RowHeader({ name, cols, trailing = true }: { name: string; cols: { label: string; title?: string }[]; trailing?: boolean }): JSX.Element {
  return (
    <div className={cn('flex items-center gap-2 text-[11px] font-medium text-muted-foreground', trailing && 'pr-9')}>
      <span className="min-w-[6rem] flex-1">{name}</span>
      {cols.map((c) => (
        <span key={c.label} title={c.title} className="w-16 text-right">
          {c.label}
        </span>
      ))}
    </div>
  )
}
