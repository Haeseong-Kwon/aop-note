// The active desk's colour becomes the accent (primary buttons, focus rings, tab
// indicator, selection tint) so each desk reads as its own room. Any swatch the
// user picks — pastel or near-black — is adjusted until button text keeps WCAG
// AA contrast (4.5:1) against it, in both themes.

export interface DeskAccent {
  /** "h s% l%" channels, as the CSS tokens expect. */
  primary: string
  primaryForeground: string
  ring: string
}

const MIN_CONTRAST = 4.5
const WHITE = '0 0% 100%'

/** #rrggbb → [h, s, l] (0–360, 0–100, 0–100); null for anything else. */
export function hexToHsl(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, Math.round(l * 100)]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [Math.round(h * 60), Math.round(s * 100), Math.round(l * 100)]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100)
  const f = (n: number): number => {
    const k = (n + h / 30) % 12
    return l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
  }
  return [f(0), f(8), f(4)]
}

const luminance = ([r, g, b]: [number, number, number]): number => {
  const lin = (c: number): number => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Accent tokens for a desk colour; null = keep the app's default accent. */
export function deskAccent(hex: string, dark: boolean): DeskAccent | null {
  const hsl = hexToHsl(hex)
  if (!hsl) return null
  const [h, s0] = hsl
  // Greys stay grey; colours keep enough saturation to still read as "this desk's colour".
  const s = s0 < 8 ? s0 : Math.max(s0, 35)
  let l = hsl[2]
  // White text on the accent: darken until it passes (dark theme starts a bit lighter so it glows less).
  if (dark) l = Math.min(l, 52)
  while (l > 10 && contrast(hslToRgb(h, s, l), [1, 1, 1]) < MIN_CONTRAST) l -= 2
  const primary = `${h} ${s}% ${l}%`
  return { primary, primaryForeground: WHITE, ring: `${h} ${s}% ${Math.min(l + 8, 62)}%` }
}

/** Apply (or clear, with null) the desk accent on the document root. */
export function applyDeskAccent(hex: string | null): void {
  const root = document.documentElement
  const accent = hex ? deskAccent(hex, root.classList.contains('dark')) : null
  for (const [prop, value] of [
    ['--primary', accent?.primary],
    ['--primary-foreground', accent?.primaryForeground],
    ['--ring', accent?.ring],
    ['--desk', accent?.primary]
  ] as const) {
    if (value) root.style.setProperty(prop, value)
    else root.style.removeProperty(prop)
  }
}
