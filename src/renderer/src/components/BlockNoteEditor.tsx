import { forwardRef, useEffect, useImperativeHandle, useRef, type ReactNode } from 'react'
import {
  SuggestionMenuController,
  useCreateBlockNote,
  type DefaultReactSuggestionItem
} from '@blocknote/react'
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
  /** Fires on every edit with the document serialized back to Markdown. */
  onMarkdownChange: (markdown: string) => void
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

    useImperativeHandle(
      ref,
      () => ({
        focusStart: () => {
          const [first] = editor.document
          if (first) editor.setTextCursorPosition(first, 'start')
          editor.focus()
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
        const md = initialMarkdown.trim()
        if (!md) {
          if (autoFocus) editor.focus()
          return
        }
        try {
          const { markdown, files } = extractFiles(md)
          const blocks = await editor.tryParseMarkdownToBlocks(markdown)
          if (blocks.length === 0) return
          editor.replaceBlocks(editor.document, restoreFileBlocks(blocks, files))
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
        onMarkdownChange(markdown)
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
        <BlockNoteView editor={editor} theme={dark ? 'dark' : 'light'} onChange={handleChange}>
          <SuggestionMenuController triggerCharacter="[" minQueryLength={1} getItems={getLinkItems} />
        </BlockNoteView>
        {footer}
      </div>
    )
  }
)
