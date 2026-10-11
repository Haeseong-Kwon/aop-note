import JSZip from 'jszip'
import { marked, type Token, type Tokens } from 'marked'

// Markdown → a real .docx (Office Open XML), built from marked's token tree with the
// zip library already used for .pptx. Covers what memos contain: headings, paragraphs,
// bold/italic/strike/code, links, bullet/numbered/task lists (nested), quotes, code
// blocks, tables, rules. Images become their alt text.
// ponytail: no embedded images; add an image relationship per aop-file:// URL if users ask.

// Characters XML 1.0 forbids (a pasted control character makes Word refuse the file).
const XML_ILLEGAL = /[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g

const esc = (s: string): string =>
  s.replace(XML_ILLEGAL, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

interface RunStyle {
  bold?: boolean
  italic?: boolean
  strike?: boolean
  code?: boolean
  link?: boolean
}

interface Ctx {
  /** External hyperlink targets, in relationship-id order (rId100+). */
  links: string[]
  /** Next numbering instance id for a numbered list (each list restarts at 1). */
  nextNum: number
  nums: number[]
}

const HYPERLINK_BASE = 100
const BULLET_NUM = 1

function run(text: string, st: RunStyle): string {
  if (!text) return ''
  const props = [
    st.link ? '<w:rStyle w:val="Hyperlink"/>' : '',
    st.bold ? '<w:b/>' : '',
    st.italic ? '<w:i/>' : '',
    st.strike ? '<w:strike/>' : '',
    st.code ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:shd w:val="clear" w:fill="F4F4F5"/>' : ''
  ].join('')
  const parts = text.split('\n').map((line) => `<w:t xml:space="preserve">${esc(line)}</w:t>`)
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}${parts.join('<w:br/>')}</w:r>`
}

function inline(tokens: Token[] | undefined, st: RunStyle, ctx: Ctx): string {
  return (tokens ?? [])
    .map((t) => {
      switch (t.type) {
        case 'strong':
          return inline((t as Tokens.Strong).tokens, { ...st, bold: true }, ctx)
        case 'em':
          return inline((t as Tokens.Em).tokens, { ...st, italic: true }, ctx)
        case 'del':
          return inline((t as Tokens.Del).tokens, { ...st, strike: true }, ctx)
        case 'codespan':
          return run(decode((t as Tokens.Codespan).text), { ...st, code: true }) // marked escapes codespans
        case 'br':
          return '<w:r><w:br/></w:r>'
        case 'link': {
          const l = t as Tokens.Link
          if (!/^(https?:|mailto:)/i.test(l.href)) return inline(l.tokens, st, ctx)
          ctx.links.push(l.href)
          const id = `rId${HYPERLINK_BASE + ctx.links.length - 1}`
          return `<w:hyperlink r:id="${id}">${inline(l.tokens, { ...st, link: true }, ctx)}</w:hyperlink>`
        }
        case 'image':
          return run(`[${(t as Tokens.Image).text || '이미지'}]`, { ...st, italic: true })
        case 'text': {
          const tx = t as Tokens.Text
          return tx.tokens ? inline(tx.tokens, st, ctx) : run(decode(tx.text), st)
        }
        case 'escape':
          return run(decode((t as Tokens.Escape).text), st)
        default:
          return 'text' in t && typeof t.text === 'string' ? run(decode(t.text), st) : ''
      }
    })
    .join('')
}

const decode = (s: string): string =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")

const para = (content: string, props = ''): string => `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ''}${content}</w:p>`

function list(l: Tokens.List, level: number, ctx: Ctx): string {
  let numId = BULLET_NUM
  if (l.ordered) {
    numId = ctx.nextNum++
    ctx.nums.push(numId)
  }
  return l.items
    .map((item) => {
      const box = item.task ? (item.checked ? '☑ ' : '☐ ') : ''
      const first = item.tokens.find((t) => t.type === 'text' || t.type === 'paragraph') as Tokens.Text | Tokens.Paragraph | undefined
      const head = para(
        run(box, {}) + inline(first?.tokens ?? (first ? [first] : []), {}, ctx),
        `<w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="${Math.min(level, 8)}"/><w:numId w:val="${numId}"/></w:numPr>`
      )
      const rest = item.tokens
        .filter((t) => t !== first)
        .map((t) => (t.type === 'list' ? list(t as Tokens.List, level + 1, ctx) : block(t, ctx)))
        .join('')
      return head + rest
    })
    .join('')
}

/** One block; `style` (e.g. Quote) applies to plain paragraphs nested in a container. */
function block(t: Token, ctx: Ctx, style = ''): string {
  const styled = style ? `<w:pStyle w:val="${style}"/>` : ''
  switch (t.type) {
    case 'heading': {
      const h = t as Tokens.Heading
      return para(inline(h.tokens, {}, ctx), `<w:pStyle w:val="Heading${Math.min(h.depth, 4)}"/>`)
    }
    case 'paragraph':
      return para(inline((t as Tokens.Paragraph).tokens, {}, ctx), styled)
    case 'text':
      return para(inline((t as Tokens.Text).tokens ?? [t], {}, ctx), styled)
    case 'list':
      return list(t as Tokens.List, 0, ctx)
    case 'blockquote':
      return (t as Tokens.Blockquote).tokens.map((b) => block(b, ctx, 'Quote')).join('')
    case 'code':
      return para(run((t as Tokens.Code).text, { code: true }), '<w:pStyle w:val="Code"/>')
    case 'hr':
      return para('', '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="CCCCCC"/></w:pBdr>')
    case 'table': {
      const tb = t as Tokens.Table
      const cell = (c: Tokens.TableCell, header: boolean): string =>
        `<w:tc><w:tcPr><w:tcBorders>${['top', 'left', 'bottom', 'right'].map((s) => `<w:${s} w:val="single" w:sz="4" w:color="CCCCCC"/>`).join('')}</w:tcBorders></w:tcPr>${para(inline(c.tokens, { bold: header }, ctx))}</w:tc>`
      const rows = [`<w:tr>${tb.header.map((c) => cell(c, true)).join('')}</w:tr>`, ...tb.rows.map((r) => `<w:tr>${r.map((c) => cell(c, false)).join('')}</w:tr>`)]
      return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>${rows.join('')}</w:tbl>${para('')}`
    }
    case 'space':
      return ''
    default:
      return 'text' in t && typeof t.text === 'string' && t.text.trim() ? para(run(decode(t.text), {})) : ''
  }
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Malgun Gothic" w:hAnsi="Malgun Gothic" w:eastAsia="Malgun Gothic"/><w:sz w:val="22"/><w:lang w:eastAsia="ko-KR"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:sz w:val="40"/></w:rPr></w:style>
${[1, 2, 3, 4].map((n) => `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="${n - 1}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${[32, 28, 24, 22][n - 1]}"/></w:rPr></w:style>`).join('\n')}
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="40"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="360"/><w:pBdr><w:left w:val="single" w:sz="12" w:space="8" w:color="DDDDDD"/></w:pBdr></w:pPr><w:rPr><w:color w:val="555555"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:shd w:val="clear" w:fill="F4F4F5"/><w:spacing w:after="120" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="19"/></w:rPr></w:style>
<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="4F46E5"/><w:u w:val="single"/></w:rPr></w:style>
</w:styles>`

function numbering(ordered: number[]): string {
  const lvls = (fmt: 'bullet' | 'decimal'): string =>
    Array.from({ length: 9 }, (_, i) => {
      const text = fmt === 'bullet' ? ['•', '◦', '▪'][i % 3] : `%${i + 1}.`
      return `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${360 * (i + 1)}" w:hanging="360"/></w:pPr></w:lvl>`
    }).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:abstractNum w:abstractNumId="0">${lvls('bullet')}</w:abstractNum>
<w:abstractNum w:abstractNumId="1">${lvls('decimal')}</w:abstractNum>
<w:num w:numId="${BULLET_NUM}"><w:abstractNumId w:val="0"/></w:num>
${ordered.map((id) => `<w:num w:numId="${id}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`).join('\n')}
</w:numbering>`
}

/** A Word document for a memo: its title as the document title, then the Markdown body. */
export async function markdownToDocx(title: string, markdown: string): Promise<Buffer> {
  const ctx: Ctx = { links: [], nextNum: BULLET_NUM + 1, nums: [] }
  const body = marked.lexer(markdown).map((t) => block(t, ctx)).join('')
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>${para(run(title, {}), '<w:pStyle w:val="Title"/>')}${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body>
</w:document>`
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
${ctx.links.map((href, i) => `<Relationship Id="rId${HYPERLINK_BASE + i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${esc(href)}" TargetMode="External"/>`).join('\n')}
</Relationships>`

  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`
  )
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  )
  zip.file('word/document.xml', document)
  zip.file('word/styles.xml', STYLES)
  zip.file('word/numbering.xml', numbering(ctx.nums))
  zip.file('word/_rels/document.xml.rels', rels)
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}
