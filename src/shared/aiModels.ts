// The models offered in Settings → AI. One list for main (validation, API call) and the renderer (picker).

export const AI_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (가장 똑똑함)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (균형)' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (가장 빠름)' }
] as const

export type AiModelId = (typeof AI_MODELS)[number]['id']

export const DEFAULT_AI_MODEL: AiModelId = 'claude-opus-5-5'

export const isAiModel = (id: string): id is AiModelId => AI_MODELS.some((m) => m.id === id)

/** Models with server-side refusal fallback (`fallbacks: "default"`); Haiku has none. */
export const hasServerFallback = (id: string): boolean => id === 'claude-opus-5-5' || id === 'claude-sonnet-5-5'
