import { useRef, useState } from 'react'
import { Sparkles, Square, FileText, ArrowUp } from 'lucide-react'
import { useAi } from '@/hooks/useAi'
import { useStore } from '@/store/useStore'
import { toastError } from '@/store/useToast'
import { PageHeader } from './PageHeader'
import { MarkdownView } from './MarkdownView'

/** [[title]] citations → clickable links (the fragment carries the title). */
const linkify = (md: string): string =>
  md.replace(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g, (_, t: string) => `[${t}](#${encodeURIComponent(t.trim())})`)

/** "AI에게 묻기": answers from the user's own memos, citing them. */
export function AskView(): JSX.Element {
  const openNote = useStore((s) => s.openNote)
  const ai = useAi()
  const [question, setQuestion] = useState('')
  const [asked, setAsked] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const ask = (): void => {
    const q = question.trim()
    if (!q || ai.running) return
    setAsked(q)
    setQuestion('')
    void ai.run('ask', { instruction: q })
  }

  const openTitle = async (href: string): Promise<void> => {
    if (!href.startsWith('#')) return void window.open(href)
    const title = decodeURIComponent(href.slice(1))
    const source = ai.result?.sources?.find((s) => s.title === title)
    try {
      const note = source ?? (await window.api.link.resolve(title, null))
      if (note) await openNote(note)
    } catch (e) {
      toastError(e)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={Sparkles} title="AI에게 묻기" />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-8 py-6">
          {!asked && (
            <p className="text-sm text-muted-foreground">
              내 메모를 근거로 답합니다. 관련 메모를 찾아 읽고, 근거가 된 메모를 [[제목]]으로 알려 줍니다.
            </p>
          )}
          {asked && <p className="mb-4 text-lg font-semibold tracking-tight">{asked}</p>}
          {ai.error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{ai.error}</p>}
          {(ai.text || ai.running) && (
            <MarkdownView
              source={linkify(ai.text) || '생각하는 중…'}
              onLinkClick={(href) => void openTitle(href)}
              className="prose-sm"
            />
          )}
          {ai.result?.sources && ai.result.sources.length > 0 && (
            <div className="mt-6 border-t border-border pt-3">
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">읽은 메모</p>
              <div className="flex flex-wrap gap-1.5">
                {ai.result.sources.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => void openNote(s).catch(toastError)}
                    className="flex items-center gap-1 rounded-md bg-muted/60 px-2 py-1 text-xs hover:bg-accent"
                  >
                    <FileText className="h-3 w-3 text-muted-foreground" />
                    {s.title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="mx-auto w-full max-w-3xl px-8 pb-6">
        <div className="flex items-end gap-2 rounded-xl border border-border bg-background/70 p-2 shadow-sm focus-within:ring-1 focus-within:ring-ring">
          <textarea
            ref={inputRef}
            autoFocus
            rows={2}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                ask()
              }
            }}
            placeholder="예: 지난주 회의에서 정한 배포 일정은?"
            className="min-h-[2.5rem] flex-1 resize-none bg-transparent px-1.5 py-1 text-sm outline-none placeholder:text-muted-foreground/60"
          />
          {ai.running ? (
            <button title="중지" onClick={ai.cancel} className="rounded-lg bg-muted p-2 hover:bg-accent">
              <Square className="h-4 w-4" />
            </button>
          ) : (
            <button
              title="묻기 (Enter)"
              onClick={ask}
              disabled={!question.trim()}
              className="rounded-lg bg-primary p-2 text-primary-foreground disabled:opacity-40"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
