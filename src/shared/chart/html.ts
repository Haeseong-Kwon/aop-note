// A chart in the Markdown copy of a memo, and back out again for export.
// In Markdown it is a fenced block — ```aop-chart + the ChartDoc JSON — so search, the
// vault mirror and Claude Code see the data, and an edit outside the app round-trips.
import { CHART_FENCE, computeReport, kindDef, parseChartDoc, type ChartDoc, type Report } from './kinds'
import { esc } from './svg'

/** JSON on one line with backticks escaped, so it can never close its own fence. */
export const chartFenceBody = (doc: ChartDoc): string => JSON.stringify(doc).replace(/`/g, '\\u0060')
export const chartMarkdown = (doc: ChartDoc): string => `\`\`\`${CHART_FENCE}\n${chartFenceBody(doc)}\n\`\`\``

const FENCE = new RegExp('^```' + CHART_FENCE + '[^\\n]*\\n([\\s\\S]*?)\\n```[ \\t]*$', 'gm')

/** Replaces every chart fence in `markdown` with `render(doc)`; unreadable fences stay as they are. */
export function replaceChartFences(markdown: string, render: (doc: ChartDoc) => string): string {
  return markdown.replace(FENCE, (whole, body: string) => {
    const doc = parseChartDoc(body.trim())
    return doc ? render(doc) : whole
  })
}

export const chartTitle = (doc: ChartDoc): string => doc.title.trim() || kindDef(doc.kind)?.name || '차트'

/** Self-contained figure (inline styles) for HTML / PDF export. */
export function chartFigureHtml(doc: ChartDoc, report: Report = computeReport(doc, 'light')): string {
  const stats = report.stats
    .map((s) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-bottom:1px solid #eeede8"><span style="color:#52514e">${esc(s.label)}</span><span style="text-align:right;${s.strong ? 'font-weight:700;color:#0b0b0b' : ''}">${esc(s.value)}</span></div>`)
    .join('')
  const table = report.table
    ? `<table style="border-collapse:collapse;width:100%;margin-top:12px;font-size:12px"><thead><tr>${report.table.head.map((h) => `<th style="text-align:left;border-bottom:1px solid #c3c2b7;padding:5px 8px;color:#52514e">${esc(h)}</th>`).join('')}</tr></thead><tbody>${report.table.rows.map((r) => `<tr>${r.map((c) => `<td style="border:0;border-bottom:1px solid #eeede8;padding:5px 8px">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    : ''
  const body = report.svg
    ? `<div style="width:100%">${report.svg.replace('<svg ', '<svg style="width:100%;height:auto;display:block" ')}</div>`
    : `<p style="color:#898781">${esc(report.empty ?? '데이터가 없습니다')}</p>`
  return `<figure style="margin:24px 0;padding:20px 22px;border:1px solid #e1e0d9;border-radius:14px;background:#fcfcfb;break-inside:avoid;font-variant-numeric:tabular-nums">
<figcaption style="font-size:16px;font-weight:700;color:#0b0b0b;margin-bottom:12px">${esc(chartTitle(doc))}</figcaption>${body}${report.insight ? `<p style="margin:14px 0 6px;font-size:13.5px;color:#0b0b0b">${esc(report.insight)}</p>` : ''}${stats ? `<div style="margin-top:8px;font-size:12.5px">${stats}</div>` : ''}${table}${doc.note.trim() ? `<p style="margin:10px 0 0;font-size:12px;color:#52514e">${esc(doc.note)}</p>` : ''}</figure>`
}

const cell = (s: string): string => s.replace(/\|/g, '\\|').replace(/\n/g, ' ')

/** Readable Markdown (no picture): title, reading, figures — for .docx and plain-text consumers. */
export function chartSummaryMarkdown(doc: ChartDoc, report: Report = computeReport(doc, 'light')): string {
  const lines = [`**📊 ${chartTitle(doc)}**`, '']
  if (report.insight) lines.push(report.insight, '')
  if (report.stats.length) lines.push('| 항목 | 값 |', '| --- | --- |', ...report.stats.map((s) => `| ${cell(s.label)} | ${cell(s.value)} |`), '')
  if (report.table) lines.push(`| ${report.table.head.map(cell).join(' | ')} |`, `| ${report.table.head.map(() => '---').join(' | ')} |`, ...report.table.rows.map((r) => `| ${r.map(cell).join(' | ')} |`), '')
  if (doc.note.trim()) lines.push(doc.note.trim(), '')
  return lines.join('\n')
}

/** Markdown export: the picture as an embedded SVG image, then the summary. */
export function chartExportMarkdown(doc: ChartDoc, toBase64: (s: string) => string): string {
  const report = computeReport(doc, 'light')
  const img = report.svg ? `![${chartTitle(doc).replace(/[[\]]/g, '')}](data:image/svg+xml;base64,${toBase64(report.svg.replace('<svg ', '<svg style="background:#fcfcfb" '))})\n\n` : ''
  return img + chartSummaryMarkdown(doc, report)
}
