import type { CSSProperties } from 'react'

// Cover gallery (offline — no Unsplash): soft gradients and solid colours.
export const COVER_GRADIENTS = [
  'linear-gradient(120deg, #a1c4fd 0%, #c2e9fb 100%)',
  'linear-gradient(120deg, #fbc2eb 0%, #a6c1ee 100%)',
  'linear-gradient(120deg, #fddb92 0%, #d1fdff 100%)',
  'linear-gradient(120deg, #84fab0 0%, #8fd3f4 100%)',
  'linear-gradient(120deg, #f6d365 0%, #fda085 100%)',
  'linear-gradient(120deg, #667eea 0%, #764ba2 100%)',
  'linear-gradient(120deg, #0f2027 0%, #2c5364 100%)',
  'linear-gradient(120deg, #e0c3fc 0%, #8ec5fc 100%)',
  'linear-gradient(120deg, #43e97b 0%, #38f9d7 100%)',
  'linear-gradient(120deg, #30cfd0 0%, #330867 100%)'
] as const

export const COVER_COLORS = ['#e3e2e0', '#eee0da', '#fadec9', '#fdecc8', '#dbeddb', '#d3e5ef', '#e8deee', '#f5e0e9', '#37352f', '#2f3437'] as const

export const PAGE_EMOJIS = [
  '📄', '📝', '📌', '📎', '📚', '📖', '🗂️', '📁', '💡', '🧠', '🎯', '🚀',
  '✅', '📊', '📈', '🗓️', '⏰', '🔥', '⭐', '❤️', '🌱', '🌟', '🧪', '🔬',
  '🛠️', '⚙️', '💻', '🖥️', '📱', '🔒', '🔑', '💬', '📣', '🤝', '👥', '🏢',
  '💰', '🧾', '🎨', '🎵', '✈️', '🏠', '☕', '🍀', '🐛', '❓', '⚠️', '🏁'
] as const

/** CSS for a sanitised cover value (see shared/pageMeta.ts). */
export function coverStyle(cover: string, position = 50): CSSProperties {
  const [kind, ...rest] = cover.split(':')
  const value = rest.join(':')
  if (kind === 'gradient') return { backgroundImage: COVER_GRADIENTS[Number(value)] ?? COVER_GRADIENTS[0] }
  if (kind === 'color') return { backgroundColor: value }
  // Validated to contain no quotes / parentheses / whitespace, so it can't escape url().
  return { backgroundImage: `url("${value}")`, backgroundSize: 'cover', backgroundPosition: `center ${position}%` }
}
