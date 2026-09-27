export interface WidthLimits {
  min: number
  max: number
  /** Width before the user drags, and after a double-click reset. */
  fallback: number
}

export const clampWidth = (value: number, { min, max }: WidthLimits): number =>
  Math.round(Math.min(max, Math.max(min, value)))

/** A width saved in localStorage — anything unusable falls back to the default. */
export function parseStoredWidth(raw: string | null, limits: WidthLimits): number {
  const value = Number(raw)
  return raw === null || !Number.isFinite(value) ? limits.fallback : clampWidth(value, limits)
}
