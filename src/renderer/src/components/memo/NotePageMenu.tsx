import { useRef, useState } from 'react'
import { MoreHorizontal, Copy, Sparkles } from 'lucide-react'
import { Popover } from '@/components/ui/popover'
import { PAGE_EMOJIS } from '@/lib/covers'
import { cn } from '@/lib/utils'
import type { PageFont, PageMeta } from '@shared/pageMeta'

const FONTS: { value: PageFont; label: string; className: string }[] = [
  { value: 'default', label: '기본', className: 'font-sans' },
  { value: 'serif', label: '세리프', className: 'font-note-serif' },
  { value: 'mono', label: '모노', className: 'font-mono' }
]

/** Notion's "⋯" page menu: typography, full width, duplicate. */
export function NotePageMenu({
  meta,
  onChange,
  onDuplicate,
  onSummarize
}: {
  meta: PageMeta
  onChange: (patch: Partial<PageMeta>) => void
  onDuplicate: () => void
  onSummarize: () => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  const font = meta.font ?? 'default'
  return (
    <>
      <button
        ref={ref}
        title="페이지 설정"
        aria-label="페이지 설정"
        onClick={() => setOpen((v) => !v)}
        className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <Popover anchorEl={ref.current} onClose={() => setOpen(false)} width={240} align="right">
          <p className="px-1 pb-1.5 text-[11px] font-medium text-muted-foreground">글꼴</p>
          <div className="grid grid-cols-3 gap-1">
            {FONTS.map((f) => (
              <button
                key={f.value}
                onClick={() => onChange({ font: f.value === 'default' ? undefined : f.value })}
                aria-pressed={font === f.value}
                className={cn(
                  'flex flex-col items-center rounded-md py-1.5 transition-colors hover:bg-accent',
                  font === f.value && 'bg-accent ring-1 ring-ring'
                )}
              >
                <span className={cn('text-xl', f.className)}>Ag</span>
                <span className="text-[11px] text-muted-foreground">{f.label}</span>
              </button>
            ))}
          </div>
          <button
            onClick={() => onChange({ fullWidth: meta.fullWidth ? undefined : true })}
            role="switch"
            aria-checked={Boolean(meta.fullWidth)}
            className="mt-2 flex w-full items-center justify-between rounded-md px-1.5 py-1.5 text-sm hover:bg-accent"
          >
            전체 너비
            <span className={cn('relative h-4 w-7 rounded-full transition-colors', meta.fullWidth ? 'bg-primary' : 'bg-muted-foreground/30')}>
              <span className={cn('absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white transition-transform', meta.fullWidth && 'translate-x-3')} />
            </span>
          </button>
          <div className="my-1.5 border-t border-border" />
          <button
            onClick={() => {
              setOpen(false)
              onSummarize()
            }}
            className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-sm hover:bg-accent"
          >
            <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
            AI로 요약하기
          </button>
          <button
            onClick={() => {
              setOpen(false)
              onDuplicate()
            }}
            className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-sm hover:bg-accent"
          >
            <Copy className="h-3.5 w-3.5 text-muted-foreground" />
            메모 복제
          </button>
        </Popover>
      )}
    </>
  )
}

/** Grid of page icons (emoji) + remove. */
export function PageIconPicker({
  anchorEl,
  current,
  onPick,
  onClose
}: {
  anchorEl: HTMLElement | null
  current?: string
  onPick: (icon: string | undefined) => void
  onClose: () => void
}): JSX.Element {
  return (
    <Popover anchorEl={anchorEl} onClose={onClose} width={296}>
      <div className="grid grid-cols-8 gap-0.5">
        {PAGE_EMOJIS.map((e) => (
          <button
            key={e}
            onClick={() => {
              onPick(e)
              onClose()
            }}
            aria-label={e}
            className={cn('flex h-8 w-8 items-center justify-center rounded-md text-lg hover:bg-accent', current === e && 'bg-accent')}
          >
            {e}
          </button>
        ))}
      </div>
      {current && (
        <button
          onClick={() => {
            onPick(undefined)
            onClose()
          }}
          className="mt-2 w-full rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          아이콘 제거
        </button>
      )}
    </Popover>
  )
}
