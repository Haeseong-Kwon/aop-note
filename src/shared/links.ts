// Obsidian-compatible wiki links inside memo Markdown: [[Title]] or [[Title|shown text]].
// Stored as plain text, so notes stay portable (the vault mirror copies them verbatim).

export interface WikiLink {
  /** Title of the note being linked (trimmed). */
  target: string
  alias: string | null
  /** Offset of the opening "[[" in the source text. */
  index: number
  length: number
}

// No brackets, pipes or newlines inside the target; alias may not span lines either.
const LINK_RE = /\[\[([^[\]|\n]+)(?:\|([^[\]\n]+))?\]\]/g

export function extractLinks(text: string): WikiLink[] {
  const links: WikiLink[] = []
  for (const m of text.matchAll(LINK_RE)) {
    const target = m[1].trim()
    if (!target) continue
    links.push({ target, alias: m[2]?.trim() || null, index: m.index ?? 0, length: m[0].length })
  }
  return links
}

/** Titles match the way Obsidian users expect: case- and edge-whitespace-insensitive. */
export const normalizeTitle = (title: string): string => title.trim().toLowerCase()

/** Point every [[oldTitle]] / [[oldTitle|alias]] at newTitle, keeping aliases. */
export function renameLinks(text: string, oldTitle: string, newTitle: string): string {
  const from = normalizeTitle(oldTitle)
  return text.replace(LINK_RE, (whole, target: string, alias?: string) =>
    normalizeTitle(target) === from ? `[[${newTitle}${alias ? `|${alias}` : ''}]]` : whole
  )
}
