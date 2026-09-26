import { useEffect, useRef, useState } from 'react'
import { createReactBlockSpec, useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import { ko as koLocale } from '@blocknote/core/locales'
import { RefreshCcw, Plus } from 'lucide-react'
import { toastError } from '@/store/useToast'
import { useIsDark } from '@/hooks/useMemoPersist'
import { SmartTypography } from '@/lib/smartTypography'
import { formatRelative } from '@/lib/format'
import { parseNoteDoc } from '@shared/noteDoc'
import { nestedSchema } from './nestedSchema'
import type { SyncedBlockSummary } from '@shared/types'

const SAVE_DELAY_MS = 700

/** The shared content, in its own small editor. Saves are shared; others' saves reload it. */
function SyncedEditor({ syncId, onMarkdown }: { syncId: string; onMarkdown: (md: string) => void }): JSX.Element {
  const dark = useIsDark()
  const editor = useCreateBlockNote({ schema: nestedSchema, dictionary: koLocale, _tiptapOptions: { extensions: [SmartTypography] } })
  const source = useRef(crypto.randomUUID()) // tells our own save echo apart from other copies'
  const loaded = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const wrap = useRef<HTMLDivElement>(null)
  const [usedIn, setUsedIn] = useState<number | null>(null)

  const load = async (): Promise<void> => {
    const block = await window.api.synced.get(syncId)
    const doc = parseNoteDoc(block?.doc)
    loaded.current = false // don't echo the replace back as an edit
    editor.replaceBlocks(editor.document, (doc?.blocks.length ? doc.blocks : [{ type: 'paragraph' }]) as typeof editor.document)
    loaded.current = true
  }

  useEffect(() => {
    load().catch(toastError)
    window.api.synced.list().then((all) => setUsedIn(all.find((s) => s.id === syncId)?.used_in ?? null), toastError)
    const off = window.api.onSyncedChanged((id, from) => {
      // Another copy saved. Reload unless the user is typing in this one right now.
      if (id === syncId && from !== source.current && !wrap.current?.contains(document.activeElement)) load().catch(toastError)
    })
    return () => {
      off()
      if (timer.current) clearTimeout(timer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncId])

  const handleChange = (): void => {
    if (!loaded.current) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try {
        const md = await editor.blocksToMarkdownLossy(editor.document)
        await window.api.synced.save(syncId, md, editor.document, source.current)
        onMarkdown(md)
      } catch (error) {
        toastError(error)
      }
    }, SAVE_DELAY_MS)
  }

  return (
    <div ref={wrap} className="bn-synced">
      <div className="bn-synced-label" contentEditable={false}>
        <RefreshCcw className="h-3 w-3" />
        동기화 블록{usedIn !== null && usedIn > 1 ? ` · ${usedIn}개 메모에서 함께 수정됨` : ''}
      </div>
      <BlockNoteView editor={editor} theme={dark ? 'dark' : 'light'} onChange={handleChange} sideMenu={false} />
    </div>
  )
}

/** No content yet: start a new synced block, or embed one that exists. */
function SyncedPicker({ onLink }: { onLink: (id: string) => void }): JSX.Element {
  const [existing, setExisting] = useState<SyncedBlockSummary[] | null>(null)
  useEffect(() => {
    window.api.synced.list().then(setExisting, toastError)
  }, [])
  return (
    <div className="bn-synced bn-synced-picker" contentEditable={false}>
      <button
        type="button"
        className="bn-synced-new"
        onClick={() => window.api.synced.create().then((b) => onLink(b.id), toastError)}
      >
        <Plus className="h-3.5 w-3.5" />새 동기화 블록 만들기
      </button>
      {existing && existing.length > 0 && (
        <>
          <p className="bn-synced-hint">또는 기존 동기화 블록을 여기에 연결 (어디서 고쳐도 모두 바뀝니다)</p>
          {existing.slice(0, 20).map((s) => (
            <button key={s.id} type="button" className="bn-synced-item" onClick={() => onLink(s.id)}>
              <span className="truncate">{s.preview || '(비어 있음)'}</span>
              <span className="shrink-0 opacity-60">
                {s.used_in}개 메모 · {formatRelative(s.updated_at)}
              </span>
            </button>
          ))}
        </>
      )}
    </div>
  )
}

export const createSynced = createReactBlockSpec(
  {
    type: 'synced',
    // cachedMd: the shared content as Markdown, so this memo's own Markdown copy
    // (search, [[links]], Claude Code) includes it.
    propSchema: { syncId: { default: '' }, cachedMd: { default: '' } },
    content: 'none'
  },
  {
    render: function Synced({ block, editor }) {
      if (!block.props.syncId) {
        return <SyncedPicker onLink={(id) => editor.updateBlock(block, { props: { syncId: id } })} />
      }
      return (
        <SyncedEditor
          syncId={block.props.syncId}
          onMarkdown={(md) => {
            if (md !== block.props.cachedMd) editor.updateBlock(block, { props: { cachedMd: md } })
          }}
        />
      )
    },
    toExternalHTML: ({ block }) => (
      <div>
        {block.props.cachedMd
          .split('\n')
          .filter((l) => l.trim())
          .map((line, i) => (
            <p key={i}>{line}</p>
          ))}
      </div>
    )
  }
)
