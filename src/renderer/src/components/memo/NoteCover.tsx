import { forwardRef, useRef, useState } from 'react'
import { ImagePlus, Move, Trash2, Upload } from 'lucide-react'
import { Popover } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { toastError } from '@/store/useToast'
import { COVER_COLORS, COVER_GRADIENTS, coverStyle } from '@/lib/covers'
import { cn } from '@/lib/utils'
import type { PageMeta } from '@shared/pageMeta'

type Patch = (patch: Partial<PageMeta>) => void

const IMAGE_TYPES = 'image/png,image/jpeg,image/gif,image/webp'

/** Gallery / upload / link — Notion's cover picker, offline-first. */
export function CoverPicker({ taskId, anchorEl, onPick, onClose }: { taskId: string; anchorEl: HTMLElement | null; onPick: Patch; onClose: () => void }): JSX.Element {
  const [tab, setTab] = useState<'gallery' | 'upload' | 'link'>('gallery')
  const [link, setLink] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const upload = async (file: File): Promise<void> => {
    try {
      // Stored like any memo attachment, so it's in backups and the vault mirror.
      const url = await window.api.attachment.addBytes(taskId, file.name, await file.arrayBuffer())
      onPick({ cover: `image:${url}`, coverPos: 50 })
      onClose()
    } catch (e) {
      toastError(e)
    }
  }

  return (
    <Popover anchorEl={anchorEl} onClose={onClose} width={340} align="right">
      <div className="mb-2 flex gap-1 border-b border-border pb-2 text-xs" role="tablist">
        {(
          [
            ['gallery', '갤러리'],
            ['upload', '업로드'],
            ['link', '링크']
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn('rounded px-2 py-1', tab === key ? 'bg-accent font-medium' : 'text-muted-foreground hover:bg-accent/60')}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'gallery' && (
        <>
          <p className="mb-1.5 text-[11px] text-muted-foreground">그라데이션</p>
          <div className="grid grid-cols-5 gap-1.5">
            {COVER_GRADIENTS.map((_, i) => (
              <button
                key={i}
                aria-label={`그라데이션 ${i + 1}`}
                onClick={() => onPick({ cover: `gradient:${i}` })}
                className="h-10 rounded-md transition-transform hover:scale-105"
                style={coverStyle(`gradient:${i}`)}
              />
            ))}
          </div>
          <p className="mb-1.5 mt-3 text-[11px] text-muted-foreground">단색</p>
          <div className="grid grid-cols-5 gap-1.5">
            {COVER_COLORS.map((c) => (
              <button
                key={c}
                aria-label={`색 ${c}`}
                onClick={() => onPick({ cover: `color:${c}` })}
                className="h-10 rounded-md border border-border transition-transform hover:scale-105"
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </>
      )}

      {tab === 'upload' && (
        <div className="py-2 text-center">
          <input
            ref={fileRef}
            type="file"
            accept={IMAGE_TYPES}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void upload(file)
            }}
          />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" />
            이미지 선택
          </Button>
          <p className="mt-2 text-[11px] text-muted-foreground">가로로 넓은 이미지(1500px 이상)가 좋습니다.</p>
        </div>
      )}

      {tab === 'link' && (
        <form
          className="flex gap-2 py-1"
          onSubmit={(e) => {
            e.preventDefault()
            const url = link.trim()
            if (!/^https:\/\/[^\s"'()\\]+$/i.test(url)) return toastError(new Error('https로 시작하는 이미지 주소를 넣으세요.'))
            onPick({ cover: `image:${url}`, coverPos: 50 })
            onClose()
          }}
        >
          <input
            autoFocus
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://…/image.jpg"
            aria-label="이미지 주소"
            className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background/70 px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
          />
          <Button type="submit" size="sm">
            적용
          </Button>
        </form>
      )}
    </Popover>
  )
}

/** The cover band. Image covers can be dragged up/down to choose what shows. */
export function NoteCover({ taskId, meta, onChange }: { taskId: string; meta: PageMeta; onChange: Patch }): JSX.Element | null {
  const [picking, setPicking] = useState(false)
  const [moving, setMoving] = useState<number | null>(null) // live position while repositioning
  const changeRef = useRef<HTMLButtonElement>(null)
  const drag = useRef<{ y: number; start: number } | null>(null)
  if (!meta.cover) return null

  const isImage = meta.cover.startsWith('image:')
  const pos = moving ?? meta.coverPos ?? 50

  return (
    <div
      className={cn('group/cover relative h-48 w-full shrink-0 bg-muted', moving !== null && 'cursor-ns-resize')}
      style={coverStyle(meta.cover, pos)}
      onPointerDown={(e) => {
        if (moving === null) return
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = { y: e.clientY, start: pos }
      }}
      onPointerMove={(e) => {
        if (!drag.current) return
        // Dragging down reveals more of the top of the image (like Notion).
        const delta = ((drag.current.y - e.clientY) / e.currentTarget.clientHeight) * 60
        setMoving(Math.min(100, Math.max(0, drag.current.start + delta)))
      }}
      onPointerUp={() => (drag.current = null)}
    >
      <div
        className={cn(
          'absolute bottom-3 right-4 flex gap-1 transition-opacity',
          moving !== null ? 'opacity-100' : 'opacity-0 focus-within:opacity-100 group-hover/cover:opacity-100'
        )}
      >
        {moving !== null ? (
          <>
            <span className="rounded-md bg-black/50 px-2 py-1 text-xs text-white">드래그해서 위치 조정</span>
            <CoverButton
              onClick={() => {
                onChange({ coverPos: Math.round(moving) })
                setMoving(null)
              }}
            >
              완료
            </CoverButton>
          </>
        ) : (
          <>
            <CoverButton ref={changeRef} onClick={() => setPicking(true)}>
              <ImagePlus className="h-3.5 w-3.5" />
              표지 변경
            </CoverButton>
            {isImage && (
              <CoverButton onClick={() => setMoving(meta.coverPos ?? 50)}>
                <Move className="h-3.5 w-3.5" />
                위치 조정
              </CoverButton>
            )}
            <CoverButton onClick={() => onChange({ cover: undefined, coverPos: undefined })} aria-label="표지 제거">
              <Trash2 className="h-3.5 w-3.5" />
            </CoverButton>
          </>
        )}
      </div>
      {picking && <CoverPicker taskId={taskId} anchorEl={changeRef.current} onPick={onChange} onClose={() => setPicking(false)} />}
    </div>
  )
}

// React 18: refs reach function components only through forwardRef.
const CoverButton = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(function CoverButton(
  { className, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        'flex items-center gap-1 rounded-md bg-background/85 px-2 py-1 text-xs font-medium text-foreground shadow-sm backdrop-blur transition-colors hover:bg-background',
        className
      )}
      {...props}
    />
  )
})
