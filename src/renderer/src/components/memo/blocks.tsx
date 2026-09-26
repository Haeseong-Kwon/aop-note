import { useState } from 'react'
import { createReactBlockSpec, useEditorChange } from '@blocknote/react'
import { defaultProps } from '@blocknote/core'
import { Globe, Link2 } from 'lucide-react'
import { toastError } from '@/store/useToast'
import { DatabaseView } from './database/DatabaseView'
import { parseViewConfig } from '@/lib/database'

// Notion-style blocks beyond BlockNote's defaults. Each has a toExternalHTML so the
// Markdown copy of the memo (search, [[links]], Claude Code, vault) still reads well.

const CALLOUT_EMOJIS = ['💡', '📌', '⚠️', '✅', '❗', '📝', '🔥', 'ℹ️', '🎯', '🚀', '❓', '📣', '🧪', '🐛', '🔒', '⭐']

export const createCallout = createReactBlockSpec(
  {
    type: 'callout',
    propSchema: {
      textColor: defaultProps.textColor,
      backgroundColor: defaultProps.backgroundColor,
      emoji: { default: '💡' }
    },
    content: 'inline'
  },
  {
    render: function Callout({ block, editor, contentRef }) {
      const [picking, setPicking] = useState(false)
      return (
        <div className="bn-callout" data-callout-bg={block.props.backgroundColor}>
          <div className="relative" contentEditable={false}>
            <button
              type="button"
              className="bn-callout-emoji"
              title="아이콘 바꾸기"
              onClick={() => setPicking((v) => !v)}
            >
              {block.props.emoji}
            </button>
            {picking && (
              <div className="bn-callout-picker" role="listbox" aria-label="콜아웃 아이콘">
                {CALLOUT_EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    role="option"
                    aria-selected={e === block.props.emoji}
                    onClick={() => {
                      editor.updateBlock(block, { props: { emoji: e } })
                      setPicking(false)
                    }}
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="bn-callout-body" ref={contentRef} />
        </div>
      )
    },
    toExternalHTML: ({ block, contentRef }) => (
      <blockquote>
        <p>
          {block.props.emoji} <span ref={contentRef} />
        </p>
      </blockquote>
    )
  }
)

export const createBookmark = createReactBlockSpec(
  {
    type: 'bookmark',
    propSchema: {
      url: { default: '' },
      title: { default: '' },
      description: { default: '' },
      image: { default: '' },
      site: { default: '' }
    },
    content: 'none'
  },
  {
    render: function Bookmark({ block, editor }) {
      const [draft, setDraft] = useState('')
      const [loading, setLoading] = useState(false)
      const { url, title, description, image, site } = block.props

      if (!url) {
        const submit = async (): Promise<void> => {
          if (!draft.trim()) return
          setLoading(true)
          try {
            const preview = await window.api.link.preview(draft.trim())
            editor.updateBlock(block, { props: preview })
          } catch (error) {
            toastError(error)
          } finally {
            setLoading(false)
          }
        }
        return (
          <form
            className="bn-bookmark-input"
            contentEditable={false}
            onSubmit={(e) => {
              e.preventDefault()
              void submit()
            }}
          >
            <Link2 className="h-4 w-4 shrink-0 opacity-60" />
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="웹 주소를 붙여 넣고 Enter (예: https://…)"
              aria-label="북마크할 웹 주소"
            />
            <button type="submit" disabled={loading || !draft.trim()}>
              {loading ? '가져오는 중…' : '북마크 만들기'}
            </button>
          </form>
        )
      }

      return (
        <a
          className="bn-bookmark"
          href={url}
          contentEditable={false}
          onClick={(e) => {
            e.preventDefault()
            window.open(url, '_blank') // main hands it to the default browser
          }}
          title={url}
        >
          <span className="bn-bookmark-text">
            <span className="bn-bookmark-title">{title || url}</span>
            {description && <span className="bn-bookmark-desc">{description}</span>}
            <span className="bn-bookmark-site">
              <Globe className="h-3 w-3" />
              {site || url}
            </span>
          </span>
          {image && <img className="bn-bookmark-image" src={image} alt="" loading="lazy" />}
        </a>
      )
    },
    toExternalHTML: ({ block }) => (
      <p>
        <a href={block.props.url}>{block.props.title || block.props.url}</a>
      </p>
    )
  }
)

interface HeadingEntry {
  id: string
  level: number
  text: string
}

/** Headings in document order, including those nested inside toggles / lists. */
function collectHeadings(blocks: readonly unknown[]): HeadingEntry[] {
  const out: HeadingEntry[] = []
  const walk = (list: readonly unknown[]): void => {
    for (const raw of list) {
      const b = raw as { id: string; type: string; props?: { level?: number }; content?: unknown; children?: unknown[] }
      if (b.type === 'heading' && Array.isArray(b.content)) {
        const text = (b.content as { text?: string; content?: { text?: string }[] }[])
          .map((c) => c.text ?? c.content?.map((x) => x.text ?? '').join('') ?? '')
          .join('')
          .trim()
        if (text) out.push({ id: b.id, level: b.props?.level ?? 1, text })
      }
      if (b.children?.length) walk(b.children)
    }
  }
  walk(blocks)
  return out
}

export const createTableOfContents = createReactBlockSpec(
  { type: 'toc', propSchema: {}, content: 'none' },
  {
    render: function TableOfContents({ editor }) {
      const [headings, setHeadings] = useState(() => collectHeadings(editor.document))
      useEditorChange(() => setHeadings(collectHeadings(editor.document)), editor)
      if (headings.length === 0) {
        return (
          <p className="bn-toc-empty" contentEditable={false}>
            목차 — 제목(# / ## / ###)을 추가하면 여기에 나타납니다.
          </p>
        )
      }
      return (
        <nav className="bn-toc" contentEditable={false} aria-label="목차">
          {headings.map((h) => (
            <button
              key={h.id}
              type="button"
              style={{ paddingLeft: `${(h.level - 1) * 16}px` }}
              onClick={() => {
                document.querySelector(`[data-id="${h.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                editor.setTextCursorPosition(h.id, 'end')
              }}
            >
              {h.text}
            </button>
          ))}
        </nav>
      )
    },
    toExternalHTML: () => <p />
  }
)

/** An inline database view; its whole configuration lives in the block's props. */
export const createDatabase = createReactBlockSpec(
  { type: 'database', propSchema: { config: { default: '' } }, content: 'none' },
  {
    render: function Database({ block, editor }) {
      const cfg = parseViewConfig(block.props.config)
      if (!cfg) return <p className="bn-toc-empty">데이터베이스 설정을 읽을 수 없습니다.</p>
      return (
        <div className="w-full" contentEditable={false}>
          <DatabaseView cfg={cfg} onConfig={(next) => editor.updateBlock(block, { props: { config: JSON.stringify(next) } })} />
        </div>
      )
    },
    toExternalHTML: ({ block }) => <p>📊 데이터베이스 뷰{parseViewConfig(block.props.config)?.title ? `: ${parseViewConfig(block.props.config)?.title}` : ''}</p>
  }
)
