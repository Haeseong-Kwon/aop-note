// PowerPoint (.pptx) → slides for the in-app viewer: title, text, pictures and speaker
// notes, in deck order. Content only — layout, themes and animation aren't reproduced
// (the viewer offers "open in the default app" for that). A .pptx is a zip of XML.
import JSZip from 'jszip'
import { posix } from 'path'
import type { PptxSlide } from '@shared/types'

const IMAGE_MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml' }
// Keep the IPC payload sane for image-heavy decks.
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const MAX_TOTAL_IMAGE_BYTES = 40 * 1024 * 1024

const decode = (s: string): string =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')

/** Paragraph texts of an XML fragment: <a:p> … <a:t>run</a:t> … </a:p>. */
const paragraphs = (xml: string): string[] =>
  [...xml.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g)]
    .map((p) => [...p[1].matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map((t) => decode(t[1])).join('').trim())
    .filter(Boolean)

/** Relationship id → { type (last URI segment), resolved zip path }. */
function relationships(xml: string | undefined, baseDir: string): Map<string, { type: string; path: string }> {
  const map = new Map<string, { type: string; path: string }>()
  for (const m of (xml ?? '').matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const attr = (name: string): string => m[1].match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? ''
    const target = attr('Target')
    if (!target || attr('TargetMode') === 'External') continue
    map.set(attr('Id'), { type: attr('Type').split('/').pop() ?? '', path: posix.normalize(posix.join(baseDir, target)) })
  }
  return map
}

const read = (zip: JSZip, path: string): Promise<string | undefined> => zip.file(path)?.async('string') ?? Promise.resolve(undefined)

export async function readPptxSlides(bytes: Buffer | Uint8Array): Promise<PptxSlide[]> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(bytes)
  } catch {
    throw new Error('PowerPoint 파일을 열 수 없습니다. 손상되었거나 .pptx 형식이 아닙니다.')
  }
  const presentation = await read(zip, 'ppt/presentation.xml')
  if (!presentation) throw new Error('PowerPoint 파일을 열 수 없습니다. 슬라이드 정보가 없습니다.')
  const deckRels = relationships(await read(zip, 'ppt/_rels/presentation.xml.rels'), 'ppt')
  const order = [...presentation.matchAll(/<p:sldId\b[^>]*\br:id="([^"]+)"/g)].map((m) => deckRels.get(m[1])?.path).filter((p): p is string => Boolean(p))

  let imageBudget = MAX_TOTAL_IMAGE_BYTES
  const slides: PptxSlide[] = []
  for (const path of order) {
    const xml = await read(zip, path)
    if (!xml) continue
    const rels = relationships(await read(zip, posix.join(posix.dirname(path), '_rels', `${posix.basename(path)}.rels`)), posix.dirname(path))

    // The title lives in the shape whose placeholder type is title / ctrTitle.
    const shapes = [...xml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/g)].map((m) => m[0])
    const titleShape = shapes.find((sp) => /<p:ph\b[^>]*\btype="(?:title|ctrTitle)"/.test(sp))
    const title = titleShape ? paragraphs(titleShape).join(' ') : ''
    const body = shapes.filter((sp) => sp !== titleShape).flatMap(paragraphs)

    const images: string[] = []
    for (const rel of rels.values()) {
      if (rel.type !== 'image') continue
      const mime = IMAGE_MIME[posix.extname(rel.path).slice(1).toLowerCase()]
      const file = zip.file(rel.path)
      if (!mime || !file) continue // EMF / WMF charts etc. can't be shown in a browser
      const data = await file.async('nodebuffer')
      if (data.byteLength > MAX_IMAGE_BYTES || data.byteLength > imageBudget) continue
      imageBudget -= data.byteLength
      images.push(`data:${mime};base64,${data.toString('base64')}`)
    }

    const notesPath = [...rels.values()].find((r) => r.type === 'notesSlide')?.path
    const notesXml = notesPath ? await read(zip, notesPath) : undefined
    // Notes pages repeat the slide number / image placeholders: keep the body text only.
    const notes = notesXml
      ? [...notesXml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/g)]
          .map((m) => m[0])
          .filter((sp) => !/<p:ph\b[^>]*\btype="(?:sldNum|sldImg|hdr|ftr|dt)"/.test(sp))
          .flatMap(paragraphs)
          .join('\n')
      : ''

    slides.push({ index: slides.length + 1, title, paragraphs: body, images, notes })
  }
  return slides
}
