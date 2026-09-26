// Notion-style page settings for a memo: icon, cover, layout. Stored as JSON in
// tasks.page_meta and sanitised on every write (the renderer is not trusted to
// produce safe CSS values — the cover ends up inside `background-image: url(...)`).

export type PageFont = 'default' | 'serif' | 'mono'

export interface PageMeta {
  /** An emoji. */
  icon?: string
  /** "gradient:<n>" | "color:#rrggbb" | "image:<https or aop-file url>" */
  cover?: string
  /** Vertical focus of an image cover, 0 (top) – 100 (bottom). */
  coverPos?: number
  fullWidth?: boolean
  font?: PageFont
}

const MAX_ICON = 16
const MAX_COVER = 2048
// No whitespace, quotes, parentheses or backslashes: nothing that could end url(...).
const COVER = /^(gradient:\d{1,2}|color:#[0-9a-f]{6}|image:(https:\/\/|aop-file:\/\/\/?)[^\s"'()\\]+)$/i
const FONTS: readonly PageFont[] = ['default', 'serif', 'mono']

export function sanitizePageMeta(input: unknown): PageMeta {
  if (!input || typeof input !== 'object') return {}
  const raw = input as Record<string, unknown>
  const out: PageMeta = {}
  if (typeof raw.icon === 'string' && raw.icon.trim() && raw.icon.length <= MAX_ICON) out.icon = raw.icon.trim()
  if (typeof raw.cover === 'string' && raw.cover.length <= MAX_COVER && COVER.test(raw.cover)) out.cover = raw.cover
  if (typeof raw.coverPos === 'number' && Number.isFinite(raw.coverPos)) out.coverPos = Math.min(100, Math.max(0, raw.coverPos))
  if (typeof raw.fullWidth === 'boolean') out.fullWidth = raw.fullWidth
  if (typeof raw.font === 'string' && (FONTS as readonly string[]).includes(raw.font)) out.font = raw.font as PageFont
  return out
}

export function parsePageMeta(json: string | null | undefined): PageMeta {
  if (!json) return {}
  try {
    return sanitizePageMeta(JSON.parse(json))
  } catch {
    return {}
  }
}
