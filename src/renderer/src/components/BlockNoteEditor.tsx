import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import { ko as koLocale } from '@blocknote/core/locales'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'
import { extractFiles, restoreFileBlocks } from '@/lib/memoMarkdown'
import { SmartTypography } from '@/lib/smartTypography'
import { cn } from '@/lib/utils'
import type { Attachment } from '@shared/types'

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
      className
    },
    ref
  ) {
    const editor = useCreateBlockNote({
      dictionary: koLocale,
      _tiptapOptions: { extensions: [SmartTypography] },
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
        <BlockNoteView editor={editor} theme={dark ? 'dark' : 'light'} onChange={handleChange} />
      </div>
    )
  }
)
