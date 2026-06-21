import {
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Code,
  Minus,
  type LucideIcon
} from 'lucide-react'

/**
 * A block insertable from the slash (/) menu.
 * - `prefix`: prepend this to the current line (headings, lists, quote).
 * - `block`: replace the current line with this multi-line snippet; `{c}` marks
 *   where the caret should land.
 */
export interface EditorBlock {
  id: string
  label: string
  hint: string
  keywords: string
  icon: LucideIcon
  kind: 'prefix' | 'block'
  /** Line prefix for kind 'prefix'; snippet (with optional `{c}`) for kind 'block'. */
  value: string
}

export const EDITOR_BLOCKS: readonly EditorBlock[] = [
  { id: 'h1', label: '제목 1', hint: '큰 제목', keywords: 'h1 heading title 제목', icon: Heading1, kind: 'prefix', value: '# ' },
  { id: 'h2', label: '제목 2', hint: '중간 제목', keywords: 'h2 heading 제목', icon: Heading2, kind: 'prefix', value: '## ' },
  { id: 'h3', label: '제목 3', hint: '작은 제목', keywords: 'h3 heading 제목', icon: Heading3, kind: 'prefix', value: '### ' },
  { id: 'todo', label: '할 일', hint: '체크박스 목록', keywords: 'todo check task 할일 체크', icon: ListChecks, kind: 'prefix', value: '- [ ] ' },
  { id: 'bullet', label: '목록', hint: '글머리 기호', keywords: 'bullet list 목록 리스트', icon: List, kind: 'prefix', value: '- ' },
  { id: 'number', label: '번호 목록', hint: '순서 있는 목록', keywords: 'number ordered 번호 목록', icon: ListOrdered, kind: 'prefix', value: '1. ' },
  { id: 'quote', label: '인용', hint: '인용 블록', keywords: 'quote 인용', icon: Quote, kind: 'prefix', value: '> ' },
  { id: 'code', label: '코드', hint: '코드 블록', keywords: 'code 코드', icon: Code, kind: 'block', value: '```\n{c}\n```' },
  { id: 'divider', label: '구분선', hint: '가로 구분선', keywords: 'divider hr line 구분선', icon: Minus, kind: 'block', value: '---\n{c}' }
]

export function filterBlocks(query: string): readonly EditorBlock[] {
  const q = query.trim().toLowerCase()
  if (!q) return EDITOR_BLOCKS
  return EDITOR_BLOCKS.filter(
    (b) => b.label.toLowerCase().includes(q) || b.keywords.toLowerCase().includes(q)
  )
}
