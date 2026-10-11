import assert from 'node:assert'
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { extractText } from './docText'

/** Smallest valid one-page PDF showing `text` (Helvetica), with a correct xref table. */
function tinyPdf(text: string): Buffer {
  const stream = `BT /F1 24 Tf 72 720 Td (${text}) Tj ET`
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ]
  let out = '%PDF-1.4\n'
  const offsets = objs.map((o, i) => {
    const at = out.length
    out += `${i + 1} 0 obj\n${o}\nendobj\n`
    return at
  })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(out, 'latin1')
}

async function main(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'aop-doctext-'))
  writeFileSync(join(dir, 'a.pdf'), tinyPdf('Quarterly revenue grew'))
  assert.match(await extractText(join(dir, 'a.pdf'), 'pdf'), /Quarterly revenue grew/, 'PDF text layer')
  writeFileSync(join(dir, 'b.md'), '# 제목\n\n본문   여러   공백')
  assert.equal(await extractText(join(dir, 'b.md'), 'md'), '# 제목 본문 여러 공백', 'whitespace collapsed')
  assert.equal(await extractText(join(dir, 'missing.pdf'), 'pdf'), '')
  assert.equal(await extractText(join(dir, 'b.md'), 'png'), '', 'unknown types index the name only')
  console.log('doc text: all assertions passed')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
