// Look of the note graph, modelled on Obsidian's graph view: small round nodes sized by
// connections, hairline links, labels that fade in with zoom, and a settings panel.
import { DEFAULT_FORCES, type Forces } from './forceLayout'

export interface GraphSettings extends Forces {
  /** Node size multiplier. */
  nodeSize: number
  /** Link width in screen px. */
  linkWidth: number
  /** Zoom at which labels start fading in (Obsidian's "text fade threshold"). */
  textFade: number
  /** Colour notes by desk instead of Obsidian's neutral grey. */
  deskColors: boolean
}

export const DEFAULT_GRAPH_SETTINGS: GraphSettings = {
  ...DEFAULT_FORCES,
  nodeSize: 1,
  linkWidth: 1,
  textFade: 0.9,
  deskColors: false
}

/** Slider ranges; stored values are clamped to these. */
export const GRAPH_RANGES = {
  nodeSize: { min: 0.5, max: 2.5, step: 0.1 },
  linkWidth: { min: 0.5, max: 4, step: 0.1 },
  textFade: { min: 0.2, max: 2.5, step: 0.05 },
  repulsion: { min: 800, max: 14000, step: 100 },
  linkLength: { min: 30, max: 300, step: 5 },
  gravity: { min: 0.001, max: 0.04, step: 0.001 }
} as const satisfies Partial<Record<keyof GraphSettings, { min: number; max: number; step: number }>>

type NumericKey = keyof typeof GRAPH_RANGES

/** Radius in world units: a floor so leaves stay visible, √links so hubs stand out without dwarfing. */
export const nodeRadius = (links: number, size: number): number => size * (3 + Math.sqrt(links) * 1.7)

/** Label opacity for a zoom level: 0 below the threshold, easing to 1 over the next 0.5×. */
export function labelAlpha(scale: number, threshold: number): number {
  const t = (scale - threshold) / 0.5
  return Math.min(1, Math.max(0, t))
}

export function parseGraphSettings(raw: string | null): GraphSettings {
  let input: Record<string, unknown> = {}
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    if (parsed && typeof parsed === 'object') input = parsed as Record<string, unknown>
  } catch {
    /* unreadable → defaults */
  }
  const out: GraphSettings = { ...DEFAULT_GRAPH_SETTINGS }
  for (const key of Object.keys(GRAPH_RANGES) as NumericKey[]) {
    const v = input[key]
    if (typeof v === 'number' && Number.isFinite(v)) out[key] = Math.min(GRAPH_RANGES[key].max, Math.max(GRAPH_RANGES[key].min, v))
  }
  if (typeof input.deskColors === 'boolean') out.deskColors = input.deskColors
  return out
}
