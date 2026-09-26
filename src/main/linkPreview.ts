import type { LinkPreview } from '@shared/types'

// Title / description / image for a bookmark block, read from the page's <title> and
// Open Graph tags. Main-process only (the renderer's CSP has no connect-src), bounded
// in time and size, and never fatal: an unreachable page still gives a URL bookmark.

const TIMEOUT_MS = 8_000
const MAX_BYTES = 1024 * 1024

type Fetcher = (url: string) => Promise<string>

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
const decode = (s: string): string =>
  s
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim()

function meta(html: string, key: string): string {
  // <meta property|name="key" content="…"> in either attribute order.
  const a = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`, 'i').exec(html)
  const b = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`, 'i').exec(html)
  return decode((a ?? b)?.[1] ?? '')
}

function absoluteHttp(href: string, base: string): string {
  if (!href) return '' // new URL('', base) would be the page itself
  try {
    const u = new URL(href, base)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : ''
  } catch {
    return ''
  }
}

const fallback = (url: URL): LinkPreview => ({
  url: url.toString(),
  title: `${url.hostname}${url.pathname === '/' ? '' : url.pathname}`,
  description: '',
  image: '',
  site: url.hostname
})

export function parseLinkPreview(html: string, url: string): LinkPreview {
  const base = fallback(new URL(url))
  const head = html.slice(0, 200_000) // metadata lives in <head>
  return {
    url: base.url,
    title: meta(head, 'og:title') || decode(/<title[^>]*>([^<]*)<\/title>/i.exec(head)?.[1] ?? '') || base.title,
    description: meta(head, 'og:description') || meta(head, 'description'),
    image: absoluteHttp(meta(head, 'og:image'), url),
    site: meta(head, 'og:site_name') || base.site
  }
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'user-agent': 'Mozilla/5.0 (Macintosh) AOP-Note link preview', accept: 'text/html' }
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  if (!(res.headers.get('content-type') ?? 'text/html').includes('html')) return ''
  const text = await res.text()
  return text.slice(0, MAX_BYTES)
}

export async function fetchLinkPreview(input: string, fetcher: Fetcher = fetchHtml): Promise<LinkPreview> {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    throw new Error('링크 주소가 올바르지 않습니다.')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('http(s) 링크만 북마크할 수 있습니다.')
  try {
    return parseLinkPreview(await fetcher(url.toString()), url.toString())
  } catch {
    return fallback(url) // offline / blocked: still a working bookmark
  }
}
