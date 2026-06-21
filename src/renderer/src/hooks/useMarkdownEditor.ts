import { useRef, useState, type KeyboardEvent, type ChangeEvent } from 'react'
import { getCaretCoordinates } from '@/lib/caretCoordinates'
import { filterBlocks, type EditorBlock } from '@/lib/editorBlocks'

interface SlashState {
  /** Index of the triggering '/'. */
  start: number
  query: string
  items: readonly EditorBlock[]
  activeIndex: number
  top: number
  left: number
}

interface FormatFns {
  bold: () => void
  italic: () => void
  code: () => void
  h1: () => void
  h2: () => void
  bullet: () => void
  checklist: () => void
  quote: () => void
  link: () => void
}

interface UseMarkdownEditor {
  textareaRef: React.RefObject<HTMLTextAreaElement>
  slash: SlashState | null
  setActiveIndex: (i: number) => void
  selectBlock: (block: EditorBlock) => void
  handleChange: (e: ChangeEvent<HTMLTextAreaElement>) => void
  handleKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void
  format: FormatFns
}

// Matches a continuable list/quote line: indent, marker, content.
const LIST_RE = /^(\s*)(- \[[ xX]\] |[-*] |\d+\. |> )(.*)$/

export function useMarkdownEditor(
  value: string,
  onChange: (next: string) => void
): UseMarkdownEditor {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [slash, setSlash] = useState<SlashState | null>(null)

  const setSelection = (caret: number): void => {
    requestAnimationFrame(() => {
      const ta = textareaRef.current
      if (!ta) return
      ta.focus()
      ta.setSelectionRange(caret, caret)
    })
  }

  // Replace the whole value and move the caret. Used by block insertion + Enter/Tab.
  const replaceAll = (next: string, caret: number): void => {
    onChange(next)
    setSelection(caret)
  }

  // Generic selection transform for the toolbar formatters.
  const apply = (
    transform: (sel: string) => { text: string; selStart: number; selEnd: number }
  ): void => {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const { text, selStart, selEnd } = transform(value.slice(start, end))
    onChange(value.slice(0, start) + text + value.slice(end))
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(start + selStart, start + selEnd)
    })
  }

  const surround = (before: string, after: string, placeholder: string) => (): void =>
    apply((sel) => {
      const body = sel || placeholder
      return {
        text: `${before}${body}${after}`,
        selStart: before.length,
        selEnd: before.length + body.length
      }
    })

  const prefixLines = (prefix: string, placeholder: string) => (): void =>
    apply((sel) => {
      const body = sel || placeholder
      const text = body
        .split('\n')
        .map((l) => `${prefix}${l}`)
        .join('\n')
      return { text, selStart: prefix.length, selEnd: text.length }
    })

  const format: FormatFns = {
    bold: surround('**', '**', '굵게'),
    italic: surround('*', '*', '기울임'),
    code: surround('`', '`', 'code'),
    h1: prefixLines('# ', '제목'),
    h2: prefixLines('## ', '제목'),
    bullet: prefixLines('- ', '항목'),
    checklist: prefixLines('- [ ] ', '할 일'),
    quote: prefixLines('> ', '인용'),
    link: (): void =>
      apply((sel) => {
        const body = sel || '링크 텍스트'
        const text = `[${body}](url)`
        return { text, selStart: text.length - 4, selEnd: text.length - 1 }
      })
  }

  // --- slash menu detection -------------------------------------------------
  const detectSlash = (text: string, caret: number): void => {
    // Walk back from the caret to a '/' with only "query" chars in between.
    let i = caret - 1
    while (i >= 0) {
      const ch = text[i]
      if (ch === '/') break
      if (ch === ' ' || ch === '\n' || ch === '\t') {
        setSlash(null)
        return
      }
      i--
    }
    if (i < 0 || text[i] !== '/') {
      setSlash(null)
      return
    }
    const before = i === 0 ? '\n' : text[i - 1]
    if (before !== '\n' && before !== ' ' && before !== '\t') {
      setSlash(null)
      return
    }
    const query = text.slice(i + 1, caret)
    const items = filterBlocks(query)
    const ta = textareaRef.current
    const coords = ta ? getCaretCoordinates(ta, i) : { top: 0, left: 0, height: 18 }
    // Caret coords are relative to the textarea; offset by the textarea's position
    // within its (relatively-positioned) wrapper so the popup lands at the cursor.
    const offTop = ta ? ta.offsetTop : 0
    const offLeft = ta ? ta.offsetLeft : 0
    setSlash({
      start: i,
      query,
      items,
      activeIndex: 0,
      top: offTop + coords.top + coords.height,
      left: offLeft + coords.left
    })
  }

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>): void => {
    const next = e.target.value
    onChange(next)
    detectSlash(next, e.target.selectionStart)
  }

  const selectBlock = (block: EditorBlock): void => {
    if (!slash) return
    const ta = textareaRef.current
    const caret = ta ? ta.selectionStart : slash.start + 1 + slash.query.length
    const text = value
    const lineStart = text.lastIndexOf('\n', slash.start - 1) + 1
    const lineEndIdx = text.indexOf('\n', caret)
    const lineEnd = lineEndIdx === -1 ? text.length : lineEndIdx

    if (block.kind === 'prefix') {
      const rest = (text.slice(lineStart, slash.start) + text.slice(caret, lineEnd)).replace(/^\s+/, '')
      const newLine = block.value + rest
      replaceAll(text.slice(0, lineStart) + newLine + text.slice(lineEnd), lineStart + block.value.length)
    } else {
      const ci = block.value.indexOf('{c}')
      const snippet = block.value.replace('{c}', '')
      const caretPos = lineStart + (ci >= 0 ? ci : snippet.length)
      replaceAll(text.slice(0, lineStart) + snippet + text.slice(lineEnd), caretPos)
    }
    setSlash(null)
  }

  const setActiveIndex = (i: number): void =>
    setSlash((s) => (s ? { ...s, activeIndex: i } : s))

  // --- Enter (list continuation) + Tab (indent) -----------------------------
  const handleEnter = (): boolean => {
    const ta = textareaRef.current
    if (!ta || ta.selectionStart !== ta.selectionEnd) return false
    const caret = ta.selectionStart
    const lineStart = value.lastIndexOf('\n', caret - 1) + 1
    const line = value.slice(lineStart, caret)
    const m = LIST_RE.exec(line)
    if (!m) return false
    const [, indent, marker, content] = m

    // Empty item → exit the list (clear the marker).
    if (content.trim() === '') {
      replaceAll(value.slice(0, lineStart) + indent + value.slice(caret), lineStart + indent.length)
      return true
    }
    // Continue the list with the next marker.
    let nextMarker = marker
    const num = /^(\d+)\. $/.exec(marker)
    if (num) nextMarker = `${parseInt(num[1], 10) + 1}. `
    else if (/^- \[[ xX]\] $/.test(marker)) nextMarker = '- [ ] ' // never carry a checked box
    const insert = `\n${indent}${nextMarker}`
    replaceAll(value.slice(0, caret) + insert + value.slice(caret), caret + insert.length)
    return true
  }

  const handleTab = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const lineStart = value.lastIndexOf('\n', start - 1) + 1
    if (e.shiftKey) {
      // Outdent: drop up to two leading spaces from the line.
      const removed = value.slice(lineStart).match(/^ {1,2}/)?.[0].length ?? 0
      if (removed === 0) return
      replaceAll(value.slice(0, lineStart) + value.slice(lineStart + removed), Math.max(lineStart, start - removed))
    } else {
      replaceAll(value.slice(0, lineStart) + '  ' + value.slice(lineStart), start + 2)
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (slash) {
      const len = slash.items.length
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (len) setActiveIndex((slash.activeIndex + 1) % len)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (len) setActiveIndex((slash.activeIndex - 1 + len) % len)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setSlash(null)
        return
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && len > 0) {
        e.preventDefault()
        selectBlock(slash.items[slash.activeIndex])
        return
      }
    }

    if (e.metaKey || e.ctrlKey) {
      const k = e.key.toLowerCase()
      const fn = { b: format.bold, i: format.italic, e: format.code, k: format.link }[k]
      if (fn) {
        e.preventDefault()
        fn()
      }
      return
    }

    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      if (handleEnter()) e.preventDefault()
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      handleTab(e)
    }
  }

  return {
    textareaRef,
    slash,
    setActiveIndex,
    selectBlock,
    handleChange,
    handleKeyDown,
    format
  }
}
