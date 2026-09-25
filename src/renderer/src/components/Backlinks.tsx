import { useEffect, useState } from 'react'
import { ChevronRight, Link2, FileText } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { toastError } from '@/store/useToast'
import { cn } from '@/lib/utils'
import type { Backlinks as BacklinksData, BacklinkHit } from '@shared/types'

/** Obsidian's "Linked mentions" / "Unlinked mentions", under a memo. */
export function Backlinks({ taskId, className }: { taskId: string; className?: string }): JSX.Element | null {
  // Any edit refreshes `tasks`, which is also when another memo may have linked here.
  const tasks = useStore((s) => s.tasks)
  const openNote = useStore((s) => s.openNote)
  const [data, setData] = useState<BacklinksData | null>(null)
  const [showMentions, setShowMentions] = useState(false)

  useEffect(() => {
    let current = true
    window.api.link.backlinks(taskId).then((d) => current && setData(d), toastError)
    return () => {
      current = false
    }
  }, [taskId, tasks])

  if (!data) return null

  const row = (hit: BacklinkHit): JSX.Element => (
    <li key={hit.task.id}>
      <button
        onClick={() => void openNote(hit.task)}
        className="group w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/60"
      >
        <span className="flex items-center gap-1.5 text-sm">
          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium">{hit.task.title}</span>
          <span className="shrink-0 truncate text-xs text-muted-foreground">
            {hit.task.workspace_name} / {hit.task.category_name}
          </span>
        </span>
        <span className="mt-0.5 block truncate pl-5 text-xs text-muted-foreground">{hit.snippet}</span>
      </button>
    </li>
  )

  return (
    <section className={cn('border-t border-border pt-4', className)} aria-label="백링크">
      <h3 className="flex items-center gap-1.5 px-2 text-xs font-medium text-muted-foreground">
        <Link2 className="h-3.5 w-3.5" />이 메모를 링크한 곳 {data.linked.length}
      </h3>
      {data.linked.length === 0 ? (
        <p className="px-2 pt-1.5 text-xs text-muted-foreground/80">
          아직 없습니다. 다른 메모에서 <code className="rounded bg-muted px-1">[[</code>를 입력해 이 메모를 연결해 보세요.
        </p>
      ) : (
        <ul className="mt-1">{data.linked.map(row)}</ul>
      )}

      {data.mentions.length > 0 && (
        <>
          <button
            onClick={() => setShowMentions((v) => !v)}
            aria-expanded={showMentions}
            className="mt-3 flex items-center gap-1 px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', showMentions && 'rotate-90')} />
            링크 없이 언급된 곳 {data.mentions.length}
          </button>
          {showMentions && <ul className="mt-1">{data.mentions.map(row)}</ul>}
        </>
      )}
    </section>
  )
}
