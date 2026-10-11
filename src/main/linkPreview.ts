import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import type { LinkPreview } from '@shared/types'

// Title / description / image for a bookmark block, read from the page's <title> and
// Open Graph tags. Main-process only (the renderer's CSP has no connect-src), bounded
// in time and size, and never fatal: an unreachable page still gives a URL bookmark.

const TIMEOUT_MS = 8_000
const MAX_BYTES = 1024 * 1024
const MAX_REDIRECTS = 3

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

function isPrivateV4(a: number, b: number): boolean {
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
  )
}

/** "::ffff:7f00:1" → 8 numeric hextets; null if not an IPv6 literal. */
function hextets(ip: string): number[] | null {
  let s = ip.toLowerCase()
  const dotted = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(s) // trailing dotted quad (::ffff:1.2.3.4)
  if (dotted) {
    const [a, b, c, d] = dotted.slice(1).map(Number)
    s = `${s.slice(0, dotted.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
  }
  const halves = s.split('::')
  if (halves.length > 2) return null
  const parse = (part: string): number[] => (part ? part.split(':').map((h) => parseInt(h, 16)) : [])
  const head = parse(halves[0])
  const tail = halves.length === 2 ? parse(halves[1]) : []
  const fill = 8 - head.length - tail.length
  if (fill < 0 || (halves.length === 1 && fill !== 0)) return null
  const all = [...head, ...Array(fill).fill(0), ...tail]
  return all.every((h) => Number.isInteger(h) && h >= 0 && h <= 0xffff) ? all : null
}

/** Loopback, private, link-local, CGNAT, unspecified and multicast ranges (v4 + v6, incl. v4 embedded in v6). */
export function isPrivateAddress(input: string): boolean {
  const ip = input.replace(/^\[|\]$/g, '')
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip)
  if (v4) return isPrivateV4(Number(v4[1]), Number(v4[2]))
  const h = hextets(ip)
  if (!h) return true // not an address we understand: refuse rather than guess
  const zeroPrefix = h.slice(0, 5).every((x) => x === 0)
  const embedded =
    (zeroPrefix && (h[5] === 0xffff || h[5] === 0)) || // ::ffff:a.b.c.d (mapped), ::a.b.c.d (compatible)
    (h[0] === 0x64 && h[1] === 0xff9b && h.slice(2, 6).every((x) => x === 0)) // 64:ff9b::/96 (NAT64)
  if (embedded) {
    if (zeroPrefix && h[5] === 0 && h[6] === 0 && h[7] <= 1) return true // :: and ::1
    return isPrivateV4(h[6] >> 8, h[6] & 0xff)
  }
  if (h[0] === 0x2002) return isPrivateV4(h[1] >> 8, h[1] & 0xff) // 6to4 carries a.b.c.d in hextets 1–2
  const first = h[0]
  return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00
}

// A bookmark preview must never reach into the LAN / this machine (SSRF).
// ponytail: checks DNS before connecting, so a rebinding DNS server could still race it; pin the IP via a custom agent if that matters.
async function assertPublicHost(url: URL): Promise<void> {
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) throw new Error('local host')
  const addrs = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address)
  if (addrs.some(isPrivateAddress)) throw new Error('private address')
}

async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let size = 0
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    size += value.byteLength
  }
  await reader.cancel().catch(() => undefined) // stop the download past the cap
  return new TextDecoder().decode(Buffer.concat(chunks).subarray(0, MAX_BYTES))
}

async function fetchHtml(start: string): Promise<string> {
  let url = new URL(start)
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(url)
    const res = await fetch(url, {
      redirect: 'manual', // every hop is re-checked against the private-address guard
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'user-agent': 'Mozilla/5.0 (Macintosh) AOP-Note link preview', accept: 'text/html' }
    })
    const location = res.headers.get('location')
    if (res.status >= 300 && res.status < 400 && location) {
      url = new URL(location, url)
      if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('bad redirect')
      continue
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    if (!(res.headers.get('content-type') ?? 'text/html').includes('html')) return ''
    return readCapped(res)
  }
  throw new Error('too many redirects')
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
