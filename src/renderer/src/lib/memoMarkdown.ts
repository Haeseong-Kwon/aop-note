/** Loosely-typed block, enough to spot the placeholder paragraphs we rewrite below. */
type LooseBlock = {
  type?: string
  content?: { type?: string; text?: string }[]
}

type FileRef = { name: string; url: string }

const FILE_LINK = /(?<!!)\[([^\]\n]*)\]\((aop-file:[^)\s]+)\)/g
const IMAGE_LINK = /!\[[^\]\n]*\]\(aop-file:[^)\s]+\)/g
const PLACEHOLDER = '@@aop-file-'

/**
 * A file block serializes to a Markdown link, but the parser drops `aop-file:`
 * hrefs on the way back in. Swap each link for a plain-text marker the parser
 * keeps verbatim, then trade the markers back for file blocks after parsing.
 * Images survive as-is; they only need their own line to become their own block.
 */
export function extractFiles(markdown: string): { markdown: string; files: FileRef[] } {
  const files: FileRef[] = []
  const text = markdown
    .replace(IMAGE_LINK, '\n\n$&\n\n')
    .replace(FILE_LINK, (_match, name: string, url: string) => {
      files.push({ name, url })
      return `\n\n${PLACEHOLDER}${files.length - 1}@@\n\n`
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { markdown: text, files }
}

export function restoreFileBlocks<T>(blocks: T[], files: FileRef[]): T[] {
  if (files.length === 0) return blocks
  return blocks.map((block) => {
    const { type, content } = block as LooseBlock
    if (type !== 'paragraph' || content?.length !== 1) return block

    const marker = content[0]?.text?.trim() ?? ''
    if (!marker.startsWith(PLACEHOLDER) || !marker.endsWith('@@')) return block

    const file = files[Number(marker.slice(PLACEHOLDER.length, -2))]
    return file ? ({ type: 'file', props: { url: file.url, name: file.name } } as T) : block
  })
}
