import assert from 'node:assert'
import { deckBlocks, markdownToPptx } from './chartExport'
import { readPptxSlides } from './pptx'
import { chartMarkdown } from '@shared/chart/html'
import { sampleDoc } from '@shared/chart/kinds'

// A 1×1 PNG stands in for the renderer-drawn chart picture.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

async function main(): Promise<void> {
  const md = `## 개요\n\n- 첫째 **항목**\n  - 하위 [[링크]]\n\n${chartMarkdown(sampleDoc('bar'))}\n\n## 표\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n${chartMarkdown(sampleDoc('describe'))}`
  const blocks = deckBlocks(md)
  assert.deepEqual(blocks.map((b) => b.kind), ['heading', 'lines', 'chart', 'heading', 'table', 'chart'])
  assert.deepEqual((blocks[1] as { lines: { text: string; level: number }[] }).lines.map((l) => [l.text, l.level]), [['첫째 항목', 0], ['하위 링크', 1]])

  const deck = await readPptxSlides(await markdownToPptx('덱 제목', md, [PNG, PNG]))
  const titles = deck.map((s) => s.title || s.paragraphs[0])
  assert.ok(deck.length >= 6, `slides: ${deck.length}`)
  assert.ok(deck[0].paragraphs.includes('덱 제목'), 'cover')
  const barSlide = deck.find((s) => s.paragraphs.includes('분기별 매출'))
  assert.ok(barSlide, `bar slide in ${JSON.stringify(titles)}`)
  assert.equal(barSlide.images.length, 1, 'chart picture on its slide')
  assert.ok(barSlide.paragraphs.some((p) => p.includes('가장 큰 항목은')), 'the reading on the chart slide')
  assert.ok(deck.some((s) => s.paragraphs.some((p) => p.includes('주간 판매량 요약 — 상세'))), 'detail table slide')
  console.log('chart export (pptx): all assertions passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
