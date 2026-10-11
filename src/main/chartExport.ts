// Charts out of the app: a PowerPoint deck built from a memo's Markdown, and the tool
// page's "export this chart" (PDF / PPTX / PNG). Chart pictures arrive as PNGs drawn by
// the renderer (canvas) — the same SVG the memo shows — in the order the charts appear.
import { dialog } from 'electron'
import { writeFile } from 'fs/promises'
import { marked, type Token, type Tokens } from 'marked'
import PptxGenJS from 'pptxgenjs'
import { CHART_FENCE, computeReport, parseChartDoc, type ChartDoc } from '@shared/chart/kinds'
import { chartFigureHtml, chartMarkdown, chartTitle } from '@shared/chart/html'
import { W as SVG_W } from '@shared/chart/svg'
import type { ExportResult } from '@shared/types'

const svgHeight = (svg: string): number => Number(svg.match(/\bheight="(\d+(?:\.\d+)?)"/)?.[1] ?? 360)

// --- PowerPoint ---------------------------------------------------------------------

const C = { ink: '0B0B0B', ink2: '52514E', muted: '898781', line: 'E1E0D9', accent: '2A78D6', plate: 'F6F6F3', white: 'FFFFFF' }
const FONT = process.platform === 'win32' ? 'Malgun Gothic' : 'Apple SD Gothic Neo'
const SLIDE_W = 13.333
const MARGIN = 0.6
const LINES_PER_SLIDE = 11
const TABLE_ROWS_PER_SLIDE = 12

type Line = { text: string; level: number; bullet: boolean; bold?: boolean }
type Block = { kind: 'heading'; depth: number; text: string } | { kind: 'lines'; lines: Line[] } | { kind: 'chart'; doc: ChartDoc } | { kind: 'table'; head: string[]; rows: string[][] }

/** Markdown inline → plain text ([[links]], **bold**, `code`, [t](u) → t). */
const plain = (s: string): string =>
  s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|~~|`)/g, '')
    .replace(/(^|\s)[*_]([^*_]+)[*_]/g, '$1$2')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()

function listLines(list: Tokens.List, level: number): Line[] {
  return list.items.flatMap((item) => {
    const own = item.tokens.filter((t) => t.type !== 'list').map((t) => ('text' in t ? String(t.text) : '')).join(' ')
    const box = item.task ? (item.checked ? '☑ ' : '☐ ') : ''
    const nested = item.tokens.filter((t): t is Tokens.List => t.type === 'list').flatMap((l) => listLines(l, level + 1))
    return [{ text: box + plain(own), level, bullet: !item.task }, ...nested]
  })
}

/** The memo as a flat list of slide-able blocks. */
export function deckBlocks(markdown: string): Block[] {
  const blocks: Block[] = []
  const pushLines = (lines: Line[]): void => {
    const last = blocks[blocks.length - 1]
    if (last?.kind === 'lines') last.lines.push(...lines)
    else blocks.push({ kind: 'lines', lines })
  }
  const walk = (tokens: Token[]): void => {
    for (const t of tokens) {
      if (t.type === 'heading') {
        const h = t as Tokens.Heading
        if (h.depth <= 2) blocks.push({ kind: 'heading', depth: h.depth, text: plain(h.text) })
        else pushLines([{ text: plain(h.text), level: 0, bullet: false, bold: true }])
      } else if (t.type === 'code' && (t as Tokens.Code).lang === CHART_FENCE) {
        const doc = parseChartDoc((t as Tokens.Code).text)
        if (doc) blocks.push({ kind: 'chart', doc })
      } else if (t.type === 'list') pushLines(listLines(t as Tokens.List, 0))
      else if (t.type === 'table') {
        const tb = t as Tokens.Table
        blocks.push({ kind: 'table', head: tb.header.map((c) => plain(c.text)), rows: tb.rows.map((r) => r.map((c) => plain(c.text))) })
      } else if (t.type === 'blockquote') walk((t as Tokens.Blockquote).tokens)
      else if (t.type === 'paragraph' || t.type === 'code' || t.type === 'text') {
        const text = plain(String((t as Tokens.Paragraph).text ?? ''))
        if (text) pushLines(text.split('\n').map((line) => ({ text: line, level: 0, bullet: false })))
      }
    }
  }
  walk(marked.lexer(markdown))
  return blocks
}

function slideTitle(slide: PptxGenJS.Slide, title: string, kicker?: string): void {
  slide.addShape('rect', { x: MARGIN, y: 0.5, w: 0.08, h: 0.5, fill: { color: C.accent }, line: { color: C.accent, width: 0 } })
  if (kicker) slide.addText(kicker, { x: MARGIN + 0.25, y: 0.28, w: 10, h: 0.3, fontFace: FONT, fontSize: 11, color: C.muted })
  slide.addText(title, { x: MARGIN + 0.25, y: 0.48, w: SLIDE_W - 2 * MARGIN - 0.25, h: 0.6, fontFace: FONT, fontSize: 24, bold: true, color: C.ink, fit: 'shrink' })
}

function addFooter(slide: PptxGenJS.Slide, deckTitle: string): void {
  slide.addText(deckTitle, { x: MARGIN, y: 7.05, w: 9, h: 0.3, fontFace: FONT, fontSize: 9, color: C.muted })
  slide.slideNumber = { x: SLIDE_W - MARGIN - 0.6, y: 7.05, w: 0.6, h: 0.3, fontFace: FONT, fontSize: 9, color: C.muted, align: 'right' }
}

function textSlides(pptx: PptxGenJS, title: string, deckTitle: string, lines: Line[]): void {
  for (let i = 0; i < lines.length; i += LINES_PER_SLIDE) {
    const slide = pptx.addSlide()
    slideTitle(slide, i ? `${title} (계속)` : title)
    slide.addText(
      lines.slice(i, i + LINES_PER_SLIDE).map((l) => ({
        text: l.text,
        options: { bullet: l.bullet ? { indent: 18 } : false, indentLevel: l.level, bold: l.bold, breakLine: true, paraSpaceAfter: 8, color: l.bold ? C.ink : C.ink2 }
      })),
      { x: MARGIN + 0.25, y: 1.45, w: SLIDE_W - 2 * MARGIN - 0.5, h: 5.4, fontFace: FONT, fontSize: 18, valign: 'top', lineSpacingMultiple: 1.15 }
    )
    addFooter(slide, deckTitle)
  }
}

const TABLE_STYLE = { fontFace: FONT, fontSize: 12, color: C.ink, border: { type: 'solid' as const, pt: 0.75, color: C.line }, valign: 'middle' as const, margin: 0.06 }

function tableSlides(pptx: PptxGenJS, title: string, deckTitle: string, head: string[], rows: string[][]): void {
  for (let i = 0; i < Math.max(rows.length, 1); i += TABLE_ROWS_PER_SLIDE) {
    const slide = pptx.addSlide()
    slideTitle(slide, i ? `${title} (계속)` : title)
    const headRow = head.map((h) => ({ text: h, options: { bold: true, fill: { color: C.plate }, color: C.ink2 } }))
    slide.addTable([headRow, ...rows.slice(i, i + TABLE_ROWS_PER_SLIDE).map((r) => head.map((_, j) => ({ text: r[j] ?? '' })))], { x: MARGIN + 0.25, y: 1.45, w: SLIDE_W - 2 * MARGIN - 0.5, ...TABLE_STYLE, autoPage: false })
    addFooter(slide, deckTitle)
  }
}

async function chartSlides(pptx: PptxGenJS, doc: ChartDoc, png: Buffer | undefined, deckTitle: string): Promise<void> {
  const report = computeReport(doc, 'light')
  const slide = pptx.addSlide()
  slideTitle(slide, chartTitle(doc), '통계·그래프')
  const imgW = 8.1
  if (png && report.svg) {
    const imgH = Math.min(5.3, (imgW * svgHeight(report.svg)) / SVG_W)
    slide.addShape('roundRect', { x: MARGIN, y: 1.35, w: imgW + 0.3, h: imgH + 0.3, fill: { color: 'FCFCFB' }, line: { color: C.line, width: 0.75 }, rectRadius: 0.12 })
    slide.addImage({ data: `data:image/png;base64,${png.toString('base64')}`, x: MARGIN + 0.15, y: 1.5, w: imgW, h: imgH })
    if (doc.note.trim()) slide.addText(doc.note, { x: MARGIN, y: 1.75 + imgH, w: imgW + 0.3, h: 0.5, fontFace: FONT, fontSize: 11, color: C.muted, valign: 'top' })
  } else {
    slide.addText(report.empty ?? '데이터가 없습니다', { x: MARGIN, y: 3, w: imgW, h: 1, fontFace: FONT, fontSize: 16, color: C.muted, align: 'center' })
  }
  // Side panel: the reading, then the figures.
  const px = MARGIN + imgW + 0.65
  const pw = SLIDE_W - px - MARGIN
  slide.addText(report.insight, { x: px, y: 1.35, w: pw, h: 1.9, fontFace: FONT, fontSize: 13, color: C.ink, valign: 'top', lineSpacingMultiple: 1.2, fit: 'shrink' })
  const stats = report.stats.slice(0, 7)
  if (stats.length) {
    slide.addTable(
      stats.map((s) => [
        { text: s.label, options: { color: C.ink2, fontSize: 10.5 } },
        { text: s.value, options: { bold: Boolean(s.strong), color: C.ink, fontSize: s.strong ? 12 : 11, align: 'right' as const } }
      ]),
      { x: px, y: 3.35, w: pw, colW: [pw * 0.46, pw * 0.54], fontFace: FONT, border: { type: 'none' }, margin: 0.04, rowH: 0.42 }
    )
  }
  addFooter(slide, deckTitle)
  if (report.table) tableSlides(pptx, `${chartTitle(doc)} — 상세`, deckTitle, report.table.head, report.table.rows)
}

function newDeck(title: string): PptxGenJS {
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.title = title
  pptx.company = 'AOP Note'
  pptx.theme = { headFontFace: FONT, bodyFontFace: FONT }
  return pptx
}

function coverSlide(pptx: PptxGenJS, title: string, subtitle: string): void {
  const slide = pptx.addSlide()
  slide.background = { color: C.white }
  slide.addShape('rect', { x: 0, y: 0, w: 0.35, h: 7.5, fill: { color: C.accent }, line: { color: C.accent, width: 0 } })
  slide.addText(title, { x: 1.1, y: 2.5, w: 11, h: 1.4, fontFace: FONT, fontSize: 40, bold: true, color: C.ink, valign: 'bottom', fit: 'shrink' })
  slide.addText(subtitle, { x: 1.1, y: 4.05, w: 11, h: 0.5, fontFace: FONT, fontSize: 16, color: C.ink2 })
}

const today = (): string => new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })

/** A memo (title + Markdown) as a 16:9 deck: cover, one slide per ##-section, a slide per chart and table. */
export async function markdownToPptx(title: string, markdown: string, images: (Buffer | null)[] = []): Promise<Buffer> {
  const blocks = deckBlocks(markdown)
  // The renderer drew one image per chart fence, in document order.
  const pngFor = new Map<ChartDoc, Buffer>()
  blocks.filter((b): b is Extract<Block, { kind: 'chart' }> => b.kind === 'chart').forEach((c, i) => {
    const png = images[i]
    if (png?.length) pngFor.set(c.doc, png)
  })

  const pptx = newDeck(title)
  coverSlide(pptx, title, today())
  let section = title
  for (const b of blocks) {
    if (b.kind === 'heading') section = b.text
    else if (b.kind === 'lines') textSlides(pptx, section, title, b.lines)
    else if (b.kind === 'table') tableSlides(pptx, section, title, b.head, b.rows)
    else await chartSlides(pptx, b.doc, pngFor.get(b.doc), title)
  }
  return (await pptx.write({ outputType: 'nodebuffer' })) as Buffer
}

// --- The tool page's "export this chart" --------------------------------------------------

export type ChartExportFormat = 'pdf' | 'pptx' | 'png'

const sanitize = (s: string): string => s.replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 100) || 'chart'
const FILTERS: Record<ChartExportFormat, Electron.FileFilter> = {
  pdf: { name: 'PDF', extensions: ['pdf'] },
  pptx: { name: 'PowerPoint', extensions: ['pptx'] },
  png: { name: 'PNG 이미지', extensions: ['png'] }
}

export function chartHtmlDocument(title: string, bodyHtml: string): string {
  const safe = title.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${safe}</title><style>body{font-family:-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;color:#0b0b0b;max-width:760px;margin:32px auto;padding:0 24px}</style></head><body>${bodyHtml}</body></html>`
}

export async function exportChart(raw: unknown, format: ChartExportFormat, png: Buffer | null, renderPdf: (html: string) => Promise<Buffer>): Promise<ExportResult> {
  const doc = parseChartDoc(raw)
  if (!doc || !FILTERS[format]) throw new Error('내보낼 차트를 읽을 수 없습니다.')
  const title = chartTitle(doc)
  const { canceled, filePath } = await dialog.showSaveDialog({ defaultPath: `${sanitize(title)}.${format}`, filters: [FILTERS[format]] })
  if (canceled || !filePath) return { canceled: true }
  if (format === 'pdf') {
    await writeFile(filePath, await renderPdf(chartHtmlDocument(title, chartFigureHtml(doc))))
  } else if (format === 'png') {
    if (!png?.length) throw new Error('데이터를 입력해야 이미지로 내보낼 수 있습니다.')
    await writeFile(filePath, png)
  } else {
    await writeFile(filePath, await markdownToPptx(title, chartMarkdown(doc), [png]))
  }
  return { canceled: false, path: filePath }
}
