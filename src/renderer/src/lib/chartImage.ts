import { computeReport, type ChartDoc } from '@shared/chart/kinds'
import { CHART_FENCE } from '@shared/chart/kinds'
import { parseChartDoc } from '@shared/chart/kinds'
import { THEMES } from '@shared/chart/svg'

const SCALE = 2 // crisp on slides and retina screens

/** The light-theme chart as PNG bytes (null when there's nothing to draw). */
export async function chartPng(doc: ChartDoc): Promise<ArrayBuffer | null> {
  const svg = computeReport(doc, 'light').svg
  if (!svg) return null
  const w = Number(svg.match(/\bwidth="(\d+)"/)?.[1] ?? 640)
  const h = Number(svg.match(/\bheight="(\d+(?:\.\d+)?)"/)?.[1] ?? 360)
  const img = new Image()
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * SCALE)
  canvas.height = Math.round(h * SCALE)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('이미지를 그릴 수 없습니다.')
  ctx.fillStyle = THEMES.light.surface
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('이미지를 만들 수 없습니다.')
  return blob.arrayBuffer()
}

const FENCE = new RegExp('^```' + CHART_FENCE + '[^\\n]*\\n([\\s\\S]*?)\\n```', 'gm')

/** One PNG per chart fence in a memo's Markdown, in order (empty for charts without data). */
export async function notePngs(markdown: string): Promise<ArrayBuffer[]> {
  const out: ArrayBuffer[] = []
  for (const m of markdown.matchAll(FENCE)) {
    const doc = parseChartDoc(m[1].trim())
    out.push((doc && (await chartPng(doc))) || new ArrayBuffer(0))
  }
  return out
}
