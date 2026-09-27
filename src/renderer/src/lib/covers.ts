import type { CSSProperties } from 'react'

// Cover gallery, offline-first: gradients, colours, CSS patterns, and a small set of
// bundled public-domain images (public/covers — The Met Open Access CC0, NASA crew photos).
// Indexes are stored in memos ("gradient:3"), so only ever append to these lists.
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
  'linear-gradient(120deg, #30cfd0 0%, #330867 100%)',
  // mesh gradients
  'radial-gradient(at 20% 20%, #ffd6e8 0, transparent 50%), radial-gradient(at 80% 0%, #c9e4ff 0, transparent 50%), radial-gradient(at 60% 100%, #d9f99d 0, transparent 55%), linear-gradient(#fef9f3, #fef9f3)',
  'radial-gradient(at 0% 100%, #7c3aed 0, transparent 55%), radial-gradient(at 100% 0%, #06b6d4 0, transparent 55%), radial-gradient(at 50% 50%, #f472b6 0, transparent 60%), linear-gradient(#1e1b4b, #1e1b4b)',
  'radial-gradient(at 10% 10%, #fde68a 0, transparent 50%), radial-gradient(at 90% 30%, #fca5a5 0, transparent 50%), radial-gradient(at 40% 100%, #fdba74 0, transparent 60%), linear-gradient(#fff7ed, #fff7ed)',
  'radial-gradient(at 80% 80%, #34d399 0, transparent 50%), radial-gradient(at 20% 30%, #60a5fa 0, transparent 55%), linear-gradient(#0f172a, #0f172a)',
  'conic-gradient(from 200deg at 30% 60%, #f0abfc, #a5b4fc, #99f6e4, #fde68a, #f0abfc)'
] as const

export interface CoverPattern {
  name: string
  style: CSSProperties
}

export const COVER_PATTERNS: readonly CoverPattern[] = [
  { name: '점', style: { backgroundColor: '#f8fafc', backgroundImage: 'radial-gradient(#94a3b8 1.4px, transparent 1.6px)', backgroundSize: '18px 18px' } },
  { name: '모눈', style: { backgroundColor: '#ffffff', backgroundImage: 'linear-gradient(#e2e8f0 1px, transparent 1px), linear-gradient(90deg, #e2e8f0 1px, transparent 1px)', backgroundSize: '22px 22px' } },
  { name: '사선', style: { backgroundImage: 'repeating-linear-gradient(45deg, #fde68a 0 14px, #fef3c7 14px 28px)' } },
  { name: '체크', style: { backgroundColor: '#e0f2fe', backgroundImage: 'linear-gradient(45deg, #bae6fd 25%, transparent 25%, transparent 75%, #bae6fd 75%), linear-gradient(45deg, #bae6fd 25%, transparent 25%, transparent 75%, #bae6fd 75%)', backgroundSize: '32px 32px', backgroundPosition: '0 0, 16px 16px' } },
  { name: '밤하늘 점', style: { backgroundColor: '#0f172a', backgroundImage: 'radial-gradient(#e2e8f0 1px, transparent 1.4px), radial-gradient(#64748b 1px, transparent 1.4px)', backgroundSize: '28px 28px, 17px 17px', backgroundPosition: '0 0, 9px 11px' } },
  { name: '청사진', style: { backgroundColor: '#1e3a8a', backgroundImage: 'linear-gradient(rgba(255,255,255,.35) 2px, transparent 2px), linear-gradient(90deg, rgba(255,255,255,.35) 2px, transparent 2px), linear-gradient(rgba(255,255,255,.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.15) 1px, transparent 1px)', backgroundSize: '100px 100px, 100px 100px, 20px 20px, 20px 20px' } },
  { name: '지그재그', style: { backgroundColor: '#fce7f3', backgroundImage: 'linear-gradient(135deg, #f9a8d4 25%, transparent 25%), linear-gradient(225deg, #f9a8d4 25%, transparent 25%)', backgroundSize: '28px 28px' } },
  { name: '타탄', style: { backgroundColor: '#14532d', backgroundImage: 'repeating-linear-gradient(0deg, rgba(250,204,21,.25) 0 6px, transparent 6px 40px), repeating-linear-gradient(90deg, rgba(220,38,38,.35) 0 10px, transparent 10px 40px)' } },
  { name: '물방울', style: { backgroundColor: '#ecfeff', backgroundImage: 'radial-gradient(circle, #67e8f9 9px, transparent 10px)', backgroundSize: '44px 44px' } },
  { name: '빗금', style: { backgroundColor: '#f5f5f4', backgroundImage: 'repeating-linear-gradient(45deg, #d6d3d1 0 1px, transparent 1px 12px), repeating-linear-gradient(-45deg, #d6d3d1 0 1px, transparent 1px 12px)' } }
]

export type CoverGroup = 'art' | 'space'

export interface CoverPreset {
  /** Also the file name: public/covers/<id>.jpg */
  id: string
  title: string
  credit: string
  group: CoverGroup
}

export const COVER_GROUP_LABEL: Record<CoverGroup, string> = {
  art: '명화 · The Met (퍼블릭 도메인)',
  space: '우주 · NASA'
}

export const COVER_PRESETS: readonly CoverPreset[] = [
  { id: 'met-great-wave', title: '가나가와 해변의 높은 파도', credit: '가쓰시카 호쿠사이', group: 'art' },
  { id: 'met-wheat-field', title: '사이프러스가 있는 밀밭', credit: '빈센트 반 고흐', group: 'art' },
  { id: 'met-harvesters', title: '곡물 수확', credit: '피터르 브뤼헐', group: 'art' },
  { id: 'met-heart-of-andes', title: '안데스의 심장', credit: '프레더릭 에드윈 처치', group: 'art' },
  { id: 'met-oxbow', title: '옥스보', credit: '토머스 콜', group: 'art' },
  { id: 'met-landers-peak', title: '로키산맥, 랜더스 피크', credit: '앨버트 비어스타트', group: 'art' },
  { id: 'met-whalers', title: '포경선', credit: 'J. M. W. 터너', group: 'art' },
  { id: 'met-venice', title: '베네치아', credit: 'J. M. W. 터너', group: 'art' },
  { id: 'met-northeaster', title: '북동풍', credit: '윈슬로 호머', group: 'art' },
  { id: 'nasa-earthrise', title: '지구돋이', credit: 'NASA · 아폴로 8호', group: 'space' },
  { id: 'nasa-blue-marble', title: '블루 마블', credit: 'NASA · 아폴로 17호', group: 'space' },
  { id: 'nasa-earthset', title: '오리온에서 본 지구', credit: 'NASA · 아르테미스', group: 'space' },
  { id: 'nasa-aurora', title: '오로라', credit: 'NASA · 국제우주정거장', group: 'space' },
  { id: 'nasa-earth-limb', title: '지구의 가장자리', credit: 'NASA · 국제우주정거장', group: 'space' },
  { id: 'nasa-nyc-night', title: '밤의 뉴욕', credit: 'NASA · 우주왕복선', group: 'space' }
]

/** Relative to index.html, so it works from the dev server and the packaged app alike. */
export const presetUrl = (id: string): string => `./covers/${id}.jpg`

/** Any gallery cover (not uploads / links), for Notion's 랜덤 button. */
export function randomCover(): string {
  const all = [
    ...COVER_GRADIENTS.map((_, i) => `gradient:${i}`),
    ...COVER_PATTERNS.map((_, i) => `pattern:${i}`),
    ...COVER_PRESETS.map((p) => `preset:${p.id}`)
  ]
  return all[Math.floor(Math.random() * all.length)]
}

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
  if (kind === 'pattern') return COVER_PATTERNS[Number(value)]?.style ?? COVER_PATTERNS[0].style
  if (kind === 'preset') {
    // Only ids from the list reach url(): stored values can't point anywhere else.
    if (!COVER_PRESETS.some((p) => p.id === value)) return {}
    return { backgroundImage: `url("${presetUrl(value)}")`, backgroundSize: 'cover', backgroundPosition: `center ${position}%` }
  }
  // Validated to contain no quotes / parentheses / whitespace, so it can't escape url().
  return { backgroundImage: `url("${value}")`, backgroundSize: 'cover', backgroundPosition: `center ${position}%` }
}
