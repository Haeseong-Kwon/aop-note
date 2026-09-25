import { useEffect } from 'react'
import { X } from 'lucide-react'
import { useToast } from '@/store/useToast'
import { cn } from '@/lib/utils'

const VISIBLE_MS = 6000

export function Toast(): JSX.Element | null {
  const toast = useToast((s) => s.toast)
  const dismiss = useToast((s) => s.dismiss)

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(dismiss, VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [toast, dismiss])

  if (!toast) return null

  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'glass-overlay fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-lg py-2 pl-4 pr-2 text-sm animate-in fade-in-0 slide-in-from-bottom-2',
        toast.tone === 'error' && 'text-destructive'
      )}
    >
      <span>{toast.message}</span>
      {toast.actionLabel && toast.onAction && (
        <button
          onClick={() => {
            toast.onAction?.()
            dismiss()
          }}
          className="rounded-md px-2 py-1 font-medium text-primary transition-colors hover:bg-accent"
        >
          {toast.actionLabel}
        </button>
      )}
      <button
        onClick={dismiss}
        aria-label="닫기"
        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
