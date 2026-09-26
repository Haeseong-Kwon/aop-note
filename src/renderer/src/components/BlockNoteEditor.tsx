import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  FormattingToolbar,
  FormattingToolbarController,
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  getFormattingToolbarItems,
  useComponentsContext,
  useCreateBlockNote,
  type DefaultReactSuggestionItem
} from '@blocknote/react'
import { AiPanel } from './ai/AiPanel'
import type { AiAction } from '@shared/types'
import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu, SuggestionMenu } from '@blocknote/core/extensions'
import { Lightbulb, Bookmark, ListTree, Link2, Table2, RefreshCcw, Sparkles } from 'lucide-react'
import { defaultViewConfig } from '@/lib/database'
import { memoSchema } from './memo/schema'
import { resolveInitial } from '@shared/noteDoc'
import { BlockNoteView } from '@blocknote/mantine'
import { ko as koLocale } from '@blocknote/core/locales'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'
import { extractFiles, restoreFileBlocks } from '@/lib/memoMarkdown'
import { SmartTypography } from '@/lib/smartTypography'
import { WikiLinks } from '@/lib/wikiLinks'
import { useStore } from '@/store/useStore'
import { cn } from '@/lib/utils'
import type { Attachment } from '@shared/types'

const LINK_SUGGESTIONS = 8

interface BlockNoteEditorProps {
  /** Task the memo belongs to — dropped files are attached to it. */
  taskId: string
  /** Markdown loaded once on mount; the editor is uncontrolled afterward. */
  initialMarkdown: string
  /** Lossless blocks saved with that Markdown (tasks.note_doc), if any. */
  initialDoc?: string | null
  /** Fires on every edit with the Markdown copy and the lossless block tree. */
  onMarkdownChange: (markdown: string, blocks: unknown[]) => void
  dark: boolean
  autoFocus?: boolean
  /** 'inline' tightens the gutter for an expanded row; 'page' is full-width. */
  variant?: 'inline' | 'page'
  /** Called when the caret leaves the top of the document (Notion-style back-to-title). */
  onLeaveTop?: () => void
  /** Called when an embedded attachment is opened, so the host can show the viewer. */
  onOpenAttachment?: (attachment: Attachment) => void
  /** Rendered after the document, inside the same scroll area (e.g. backlinks). */
  footer?: ReactNode
  className?: string
}

export interface MemoEditorHandle {
  /** Put the caret at the very start of the document and focus it. */
  focusStart: () => void
  /** Run AI on the whole memo (page menu: summarize → inserted at the top). */
  aiOnPage: (action: AiAction) => void
}

/** Where an applied AI result goes. */
type AiTarget = { kind: 'blocks'; ids: string[] } | { kind: 'top' }

/** "✨ AI" in BlockNote's selection toolbar, styled like its own buttons. */
function AiToolbarButton({ onClick }: { onClick: () => void }): JSX.Element {
  const Components = useComponentsContext()
  if (!Components) return <></>
  return (
    <Components.FormattingToolbar.Button mainTooltip="AI로 다듬기·요약·번역" label="AI" icon={<Sparkles size={16} />} onClick={onClick}>
      AI
    </Components.FormattingToolbar.Button>
  )
}

/**
 * Notion-style WYSIWYG editor. Stores content as Markdown so the rest of the app
 * (export, search, notifications) keeps working unchanged. Markdown round-trips
 * through BlockNote's lossy converters, which is fine for note-taking content.
 */
export const BlockNoteEditor = forwardRef<MemoEditorHandle, BlockNoteEditorProps>(
  function BlockNoteEditor(
    {
      taskId,
      initialMarkdown,
      initialDoc,
      onMarkdownChange,
      dark,
      autoFocus,
      variant = 'inline',
      onLeaveTop,
      onOpenAttachment,
      footer,
      className
    },
    ref
  ) {
    const editor = useCreateBlockNote({
      schema: memoSchema,
      dictionary: koLocale,
      _tiptapOptions: {
        extensions: [
          SmartTypography,
          // The editor is created once, so read the source task at click time.
          WikiLinks.configure({
            onOpen: (title) => {
              const from = useStore.getState().tasks.find((t) => t.id === taskId)
              if (from) void useStore.getState().openLink(title, from)
            }
          })
        ]
      },
      // Drag & drop / paste of a file anywhere in the memo lands here.
      uploadFile: async (file: File): Promise<string> => {
        try {
          return await window.api.attachment.addBytes(taskId, file.name, await file.arrayBuffer())
        } catch (error) {
          console.error('Failed to attach file to memo:', error)
          throw new Error(error instanceof Error ? error.message : '파일 첨부에 실패했습니다.')
        }
      }
    })
    const loaded = useRef(false)
    const [ai, setAi] = useState<{ text: string; mode: 'selection' | 'insert'; action?: AiAction; target: AiTarget } | null>(null)

    const openAiForSelection = (): void => {
      const selected = editor.getSelection()?.blocks ?? [editor.getTextCursorPosition().block]
      const text = editor.blocksToMarkdownLossy(selected)
      setAi({ text, mode: 'selection', target: { kind: 'blocks', ids: selected.map((b) => b.id) } })
    }

    const applyAi = async (markdown: string, how: 'replace' | 'below'): Promise<void> => {
      if (!ai) return
      const blocks = await editor.tryParseMarkdownToBlocks(markdown)
      if (blocks.length === 0) return setAi(null)
      if (ai.target.kind === 'top') {
        const first = editor.document[0]
        const header = await editor.tryParseMarkdownToBlocks('### ✨ AI 요약')
        if (first) editor.insertBlocks([...header, ...blocks, { type: 'divider' }], first, 'before')
      } else {
        const ids = ai.target.ids
        const last = editor.getBlock(ids[ids.length - 1])
        const emptyTarget = ids.length === 1 && last && Array.isArray(last.content) && last.content.length === 0
        if (how === 'replace' || emptyTarget) editor.replaceBlocks(ids, blocks)
        else if (last) editor.insertBlocks(blocks, last, 'after')
      }
      setAi(null)
    }

    useImperativeHandle(
      ref,
      () => ({
        focusStart: () => {
          const [first] = editor.document
          if (first) editor.setTextCursorPosition(first, 'start')
          editor.focus()
        },
        aiOnPage: (action) => {
          setAi({ text: editor.blocksToMarkdownLossy(editor.document), mode: 'insert', action, target: { kind: 'top' } })
        }
      }),
      [editor]
    )

    // Hydrate the editor from Markdown exactly once. `loaded` is the only guard —
    // an abort flag would race with StrictMode's double effect and drop the content.
    useEffect(() => {
      const hydrate = async (): Promise<void> => {
        if (loaded.current) return
        loaded.current = true
        const parseMarkdown = async (md: string): Promise<typeof editor.document> => {
          const { markdown, files } = extractFiles(md)
          return restoreFileBlocks(await editor.tryParseMarkdownToBlocks(markdown), files)
        }
        // Lossless path first: the blocks saved with this exact Markdown (plus anything
        // appended outside the editor). Fall back to parsing Markdown if they don't fit.
        const { blocks: saved, append } = resolveInitial(initialMarkdown, initialDoc)
        if (saved) {
          try {
            if (saved.length > 0) editor.replaceBlocks(editor.document, saved as typeof editor.document)
            if (append) {
              const extra = await parseMarkdown(append)
              const last = editor.document[editor.document.length - 1]
              if (extra.length > 0 && last) editor.insertBlocks(extra, last, 'after')
            }
            if (autoFocus) editor.focus()
            return
          } catch (error) {
            console.error('Saved memo blocks could not be loaded; using Markdown:', error)
          }
        }
        const md = initialMarkdown.trim()
        if (!md) {
          if (autoFocus) editor.focus()
          return
        }
        try {
          const blocks = await parseMarkdown(md)
          if (blocks.length === 0) return
          editor.replaceBlocks(editor.document, blocks)
          if (autoFocus) editor.focus()
        } catch (error) {
          console.error('Failed to parse memo markdown:', error)
        }
      }
      void hydrate()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editor])

    const handleChange = async (): Promise<void> => {
      try {
        const markdown = await editor.blocksToMarkdownLossy(editor.document)
        onMarkdownChange(markdown, editor.document)
      } catch (error) {
        console.error('Failed to serialize memo to markdown:', error)
      }
    }

    /**
     * Open an embedded attachment in the app's document viewer instead of letting
     * the browser navigate to the `aop-file://` URL. Clicks land on the file
     * block's name/icon or on an image, so resolve the nearest block's url.
     */
    const handleClick = (e: React.MouseEvent): void => {
      if (!onOpenAttachment) return
      const target = e.target as HTMLElement
      const content = target.closest('[data-content-type="file"], [data-content-type="image"]')
      // The file block renders no anchor, so read the url off the block itself.
      const blockId = content?.closest<HTMLElement>('[data-id]')?.dataset.id
      if (!blockId) return

      const url = (editor.getBlock(blockId)?.props as { url?: string } | undefined)?.url ?? ''
      if (!url.startsWith('aop-file:')) return

      e.preventDefault()
      e.stopPropagation()
      void window.api.attachment
        .findByUrl(url)
        .then((attachment) => {
          if (attachment) onOpenAttachment(attachment)
        })
        .catch((error) => console.error('Failed to resolve memo attachment:', error))
    }

    /**
     * "[[" autocompletes note titles. The menu triggers on a single "[" (and restarts
     * on the second), so read the text before the caret rather than the query:
     * only "[[" followed by a title-in-progress offers suggestions ("[ ]" offers none).
     */
    const getLinkItems = async (): Promise<DefaultReactSuggestionItem[]> => {
      const { $from } = editor.prosemirrorState.selection
      const before = $from.parent.textBetween(Math.max(0, $from.parentOffset - 200), $from.parentOffset)
      const open = before.match(/\[\[([^[\]\n]*)$/)
      if (!open) return []
      const q = open[1].trim()
      const insert = (title: string) => (): void => {
        // BlockNote has already removed the trigger "[" and what followed it; the
        // first "[" of the pair may still be there — complete it rather than doubling it.
        const { $from: at } = editor.prosemirrorState.selection
        const leftover = at.parent.textBetween(Math.max(0, at.parentOffset - 1), at.parentOffset) === '['
        const text = `${leftover ? '[' : '[['}${title}]] `
        editor.insertInlineContent([{ type: 'text', text, styles: {} }])
      }
      const titles = q
        ? (await window.api.search.query(q))
            // Search also matches memo bodies; a link suggestion should match the title.
            .filter((h) => h.type === 'task' && h.id !== taskId && h.title.toLowerCase().includes(q.toLowerCase()))
            .map((h) => ({ title: h.title, subtext: h.subtitle }))
        : useStore
            .getState()
            .tasks.filter((t) => t.id !== taskId)
            .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
            .map((t) => ({ title: t.title, subtext: '최근 수정' }))
      const items: DefaultReactSuggestionItem[] = titles
        .slice(0, LINK_SUGGESTIONS)
        .map((t) => ({ ...t, onItemClick: insert(t.title) }))
      if (q && !titles.some((t) => t.title.toLowerCase() === q.toLowerCase())) {
        items.push({ title: `[[${q}]]`, subtext: '아직 없는 메모 — ⌘+클릭하면 만들어집니다', onItemClick: insert(q) })
      }
      return items
    }

    /** "/" menu: BlockNote's blocks (Korean) plus the Notion-style ones. */
    const getSlashItems = async (query: string): Promise<DefaultReactSuggestionItem[]> => {
      const group = '노트 블록'
      const extra: DefaultReactSuggestionItem[] = [
        {
          title: 'AI에게 요청',
          subtext: '이 메모를 바탕으로 쓰기·정리 (Claude)',
          aliases: ['ai', 'claude', '인공지능', '작성', '생성', '에이아이'],
          group: 'AI',
          icon: <Sparkles size={18} />,
          onItemClick: () => {
            const current = editor.getTextCursorPosition().block
            setAi({ text: editor.blocksToMarkdownLossy(editor.document), mode: 'insert', target: { kind: 'blocks', ids: [current.id] } })
          }
        },
        {
          title: '콜아웃',
          subtext: '아이콘이 있는 강조 상자',
          aliases: ['callout', '콜아웃', '강조', '박스', '팁'],
          group,
          icon: <Lightbulb size={18} />,
          onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: 'callout' })
        },
        {
          title: '웹 북마크',
          subtext: '링크를 제목·설명·이미지 카드로',
          aliases: ['bookmark', '북마크', '링크', 'url', '웹'],
          group,
          icon: <Bookmark size={18} />,
          onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: 'bookmark' })
        },
        {
          title: '목차',
          subtext: '이 메모의 제목으로 목차 만들기',
          aliases: ['toc', '목차', 'contents', 'outline'],
          group,
          icon: <ListTree size={18} />,
          onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: 'toc' })
        },
        {
          title: '데이터베이스 뷰',
          subtext: '이 데스크의 작업을 표·보드·목록·갤러리로',
          aliases: ['database', 'db', 'table', 'board', '데이터베이스', '표', '보드', '칸반', '갤러리'],
          group,
          icon: <Table2 size={18} />,
          onItemClick: () => {
            const { tasks, activeWorkspaceId } = useStore.getState()
            const memo = tasks.find((t) => t.id === taskId)
            if (!activeWorkspaceId) return
            insertOrUpdateBlockForSlashMenu(editor, {
              type: 'database',
              props: { config: JSON.stringify(defaultViewConfig(activeWorkspaceId, memo?.category_id ?? null)) }
            })
          }
        },
        {
          title: '동기화 블록',
          subtext: '여러 메모에 같은 내용을 두고 한 곳에서 고치기',
          aliases: ['synced', 'sync', '동기화', '공유', '재사용'],
          group,
          icon: <RefreshCcw size={18} />,
          onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: 'synced' })
        },
        {
          title: '페이지 링크',
          subtext: '다른 메모를 [[링크]]로 연결',
          aliases: ['page', 'link', 'wiki', '페이지', '링크', '연결'],
          group,
          icon: <Link2 size={18} />,
          onItemClick: () => {
            // "[" + opening the menu on "[" types "[[", which the link menu answers.
            editor.insertInlineContent('[')
            editor.getExtension(SuggestionMenu)?.openSuggestionMenu('[')
          }
        }
      ]
      return filterSuggestionItems([...getDefaultReactSlashMenuItems(editor), ...extra], query)
    }

    // ArrowUp on the first block hands focus back to the title above.
    const handleKeyDown = (e: React.KeyboardEvent): void => {
      if (!onLeaveTop || e.key !== 'ArrowUp' || e.nativeEvent.isComposing) return
      const { prevBlock } = editor.getTextCursorPosition()
      if (prevBlock) return
      e.preventDefault()
      onLeaveTop()
    }

    return (
      <div
        onKeyDown={handleKeyDown}
        onClickCapture={handleClick}
        className={cn(
          'bn-memo overflow-y-auto',
          variant === 'inline' ? 'bn-memo--inline' : 'bn-memo--page',
          className
        )}
      >
        <BlockNoteView editor={editor} theme={dark ? 'dark' : 'light'} onChange={handleChange} slashMenu={false} formattingToolbar={false}>
          <FormattingToolbarController
            formattingToolbar={() => (
              <FormattingToolbar>
                {...getFormattingToolbarItems()}
                <AiToolbarButton key="ai" onClick={openAiForSelection} />
              </FormattingToolbar>
            )}
          />
          <SuggestionMenuController triggerCharacter="/" getItems={getSlashItems} />
          <SuggestionMenuController triggerCharacter="[" minQueryLength={1} getItems={getLinkItems} />
        </BlockNoteView>
        {footer}
        {ai &&
          createPortal(
            <AiPanel
              text={ai.text}
              mode={ai.mode}
              initialAction={ai.action}
              onApply={(md, how) => void applyAi(md, how)}
              onClose={() => setAi(null)}
            />,
            document.body
          )}
      </div>
    )
  }
)
