import assert from 'node:assert'
import JSZip from 'jszip'
import { readPptxSlides } from './pptx'

const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

const shape = (text: string[], ph?: string): string =>
  `<p:sp>${ph ? `<p:nvSpPr><p:nvPr><p:ph type="${ph}"/></p:nvPr></p:nvSpPr>` : ''}<p:txBody>${text
    .map((t) => `<a:p><a:r><a:t>${t}</a:t></a:r></a:p>`)
    .join('')}</p:txBody></p:sp>`
const slide = (body: string): string => `<?xml version="1.0"?><p:sld><p:cSld><p:spTree>${body}</p:spTree></p:cSld></p:sld>`
const rels = (items: [string, string, string][]): string =>
  `<Relationships>${items.map(([id, type, target]) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`).join('')}</Relationships>`

async function main(): Promise<void> {
  const zip = new JSZip()
  // Deck order (sldIdLst) differs from file numbering: slide2.xml is shown first.
  zip.file('ppt/presentation.xml', '<p:presentation><p:sldIdLst><p:sldId id="256" r:id="rId3"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst></p:presentation>')
  zip.file('ppt/_rels/presentation.xml.rels', rels([['rId2', 'slide', 'slides/slide1.xml'], ['rId3', 'slide', 'slides/slide2.xml']]))
  zip.file('ppt/slides/slide2.xml', slide(shape(['사업 계획 &amp; 전략'], 'ctrTitle') + shape(['시장 규모', '경쟁사 &lt;3곳&gt;'])))
  zip.file('ppt/slides/_rels/slide2.xml.rels', rels([['rId1', 'image', '../media/image1.png'], ['rId2', 'notesSlide', '../notesSlides/notesSlide1.xml']]))
  zip.file('ppt/media/image1.png', PNG_1PX)
  zip.file('ppt/notesSlides/notesSlide1.xml', slide(shape(['3분 안에 끝낼 것'])))
  zip.file('ppt/slides/slide1.xml', slide(shape(['부록'], 'title') + shape(['참고 자료'])))
  zip.file('ppt/media/chart.emf', 'emf') // not viewable in a browser → skipped
  const bytes = await zip.generateAsync({ type: 'nodebuffer' })

  const slides = await readPptxSlides(bytes)
  assert.equal(slides.length, 2)
  assert.equal(slides[0].title, '사업 계획 & 전략', 'deck order, entities decoded, title placeholder')
  assert.deepEqual(slides[0].paragraphs, ['시장 규모', '경쟁사 <3곳>'])
  assert.equal(slides[0].notes, '3분 안에 끝낼 것')
  assert.equal(slides[0].images.length, 1)
  assert.match(slides[0].images[0], /^data:image\/png;base64,/)
  assert.equal(slides[1].title, '부록')
  assert.deepEqual(slides[1].paragraphs, ['참고 자료'])
  assert.equal(slides[1].notes, '')

  await assert.rejects(readPptxSlides(Buffer.from('not a zip')), /PowerPoint/)
  console.log('pptx: all assertions passed')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
