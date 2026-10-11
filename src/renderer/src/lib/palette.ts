// Shared swatch palette + emoji set for desk/category customization.

export interface PaletteGroup<T> {
  label: string
  items: readonly T[]
}

// Each row is one family at a similar lightness/saturation, ordered by hue
// (blue → green → yellow → red → purple → neutral) so columns line up across rows.
// Every swatch keeps enough contrast for the white check mark.
export const SWATCH_GROUPS: readonly PaletteGroup<string>[] = [
  {
    label: '차분',
    items: ['#3b6ea5', '#5c7a99', '#2e8b84', '#5b8266', '#8a8f5c', '#a8763e', '#996b52', '#a4574d', '#b06a80', '#7d6b9e', '#64748b', '#78716c']
  },
  {
    label: '선명',
    items: ['#2563eb', '#0284c7', '#0d9488', '#16a34a', '#65a30d', '#ca8a04', '#ea580c', '#dc2626', '#db2777', '#9333ea', '#4f46e5', '#475569']
  },
  {
    label: '파스텔',
    items: ['#7aa2d6', '#6fb3c8', '#6dbfae', '#82b88e', '#a9b86e', '#d4b05c', '#e0976a', '#e08a8a', '#e08ab3', '#b494d8', '#9a9fe0', '#9aa5b4']
  },
  {
    label: '깊은',
    items: ['#1e3a8a', '#164e63', '#134e4a', '#14532d', '#3f6212', '#713f12', '#7c2d12', '#7f1d1d', '#831843', '#581c87', '#312e81', '#1f2937']
  }
]

export const SWATCHES: readonly string[] = SWATCH_GROUPS.flatMap((g) => g.items)

export const EMOJI_GROUPS: readonly PaletteGroup<string>[] = [
  {
    label: '업무',
    items: ['📁', '📂', '🗂️', '💼', '📝', '📌', '📎', '📊', '📈', '📉', '📋', '📅', '🗓️', '⏰', '✅', '☑️', '🎯', '🏷️', '🔖', '📣', '💬', '📧', '📞', '🧾', '🖊️', '🔍', '🧮', '🗃️', '📦', '🏢']
  },
  {
    label: '개발',
    items: ['💻', '🖥️', '⌨️', '🖱️', '📱', '🛠️', '🔧', '🔩', '⚙️', '🧩', '🧪', '🔬', '🧬', '🤖', '🐛', '🚀', '🛰️', '📡', '🔒', '🔑', '🛡️', '🧱', '🗄️', '☁️', '🌐', '🔌', '🔋', '💾', '🧰', '⚡']
  },
  {
    label: '학습',
    items: ['📚', '📖', '📓', '📒', '📕', '📗', '📘', '📙', '🎓', '🏫', '✏️', '🖍️', '📐', '📏', '🧠', '💡', '🔭', '🗺️', '🧭', '🌍', '🈶', '🔤', '🔢', '➗', '🎼', '🎹', '🎸', '🎨', '🖌️', '📷']
  },
  {
    label: '생활',
    items: ['🏠', '🏡', '🛒', '💰', '💳', '🏦', '🧺', '🧹', '🍳', '☕', '🍵', '🍎', '🥗', '🍱', '🍰', '🍷', '💊', '🏥', '🧘', '🏃', '🚴', '🏋️', '⚽', '🎮', '🎬', '🎧', '✈️', '🚗', '🧳', '🏖️']
  },
  {
    label: '자연',
    items: ['🌱', '🌿', '🍀', '🌳', '🌲', '🌵', '🌸', '🌻', '🌹', '🍁', '🍂', '🌾', '🌊', '🔥', '❄️', '☀️', '🌙', '⭐', '🌈', '⛰️', '🐶', '🐱', '🦊', '🐻', '🐼', '🐧', '🦉', '🐝', '🦋', '🐳']
  },
  {
    label: '기호',
    items: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💎', '👑', '🏆', '🎖️', '🎁', '🎉', '✨', '💫', '🔮', '🪐', '♻️', '⚠️', '❗', '❓', '💯', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫']
  }
]

export const DESK_EMOJIS: readonly string[] = EMOJI_GROUPS.flatMap((g) => g.items)

/** First user-perceived character (keeps ZWJ / flag / skin-tone sequences whole); '' if none. */
export function firstGrapheme(text: string): string {
  const first = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text.trim())[Symbol.iterator]().next()
  return first.done ? '' : first.value.segment
}
