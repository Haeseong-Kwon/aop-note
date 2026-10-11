import assert from 'node:assert'
import JSZip from 'jszip'
import mammoth from 'mammoth'
import { markdownToDocx } from './docx'

async function main(): Promise<void> {
  const md = [
    '## 회의 결과',
    '',
    '**결정**: A안 & <B안> 보류, `deploy.sh` 사용. [문서](https://example.com/a?b=1&c=2)',
    '',
    '- 첫째',
    '  - 중첩',
    '- [x] 완료한 일',
    '',
    '1. 하나',
    '2. 둘',
    '',
    '> 인용문',
    '',
    '```',
    'const x = 1',
    '```',
    '',
    '| 이름 | 값 |',
    '| --- | --- |',
    '| a | 1 |'
  ].join('\n')
  const buf = await markdownToDocx('주간 회의 & 정리', md)
  const zip = await JSZip.loadAsync(buf)
  for (const part of ['[Content_Types].xml', 'word/document.xml', 'word/styles.xml', 'word/numbering.xml', 'word/_rels/document.xml.rels']) {
    assert.ok(zip.file(part), `${part} present`)
  }
  const xml = await zip.file('word/document.xml')!.async('string')
  assert.ok(!/[<&](?![a-zA-Z/?!#])/.test(xml.replace(/<\?xml[^>]*\?>/, '')), 'no unescaped < or & in document.xml')
  assert.match(xml, /Heading2/)
  assert.match(xml, /w:hyperlink r:id="rId100"/)
  const rels = await zip.file('word/_rels/document.xml.rels')!.async('string')
  assert.match(rels, /Target="https:\/\/example.com\/a\?b=1&amp;c=2" TargetMode="External"/)

  // Round-trip through a real .docx reader.
  const text = (await mammoth.extractRawText({ buffer: buf })).value
  for (const s of ['주간 회의 & 정리', '회의 결과', 'A안 & <B안> 보류', 'deploy.sh', '중첩', '☑ 완료한 일', '하나', '인용문', 'const x = 1', '이름']) {
    assert.ok(text.includes(s), `docx text contains "${s}"`)
  }

  // marked hands codespans / escapes over HTML-escaped; control characters are illegal in XML 1.0.
  const tricky = await markdownToDocx('제어\u0007문자', 'if `x<y && z>0` then \\* literal\n\nbell\u0001here')
  const tz = await JSZip.loadAsync(tricky)
  const txml = await tz.file('word/document.xml')!.async('string')
  assert.ok(!/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(txml), 'no XML-illegal control characters')
  const ttext = (await mammoth.extractRawText({ buffer: tricky })).value
  assert.ok(ttext.includes('x<y && z>0'), `inline code keeps < & > (got: ${ttext})`)
  assert.ok(!ttext.includes('&lt;') && !ttext.includes('&amp;'), 'no double-escaped entities')
  assert.ok(ttext.includes('* literal'))
  console.log('docx: all assertions passed')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
