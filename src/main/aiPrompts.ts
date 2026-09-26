import type { AiAction } from '@shared/types'
import type { TaskWithContext } from '@shared/types'

// Pure prompt building and parsing for the in-app AI (no I/O — tested in ai.check.ts).

export const AI_ACTIONS: readonly AiAction[] = [
  'summarize',
  'improve',
  'shorter',
  'longer',
  'continue',
  'translate_en',
  'translate_ko',
  'action_items',
  'custom',
  'ask'
]

const SYSTEM = [
  'You are the writing assistant inside AOP Note, a Korean work-notes app.',
  'Reply in 한국어 unless the task asks for another language or the text is clearly in another language.',
  'Output only the result as Markdown — no preamble ("물론이죠", "다음은…"), no closing remarks, no code fences around the whole answer.',
  'Keep [[Note title]] wiki links exactly as written; they link notes together.'
].join('\n')

const SYSTEM_ASK = [
  "You answer questions using the user's own notes from AOP Note, provided in <note> tags.",
  'Answer in 한국어, concisely, as Markdown.',
  'Base the answer on the notes; if they do not contain the answer, say so plainly and suggest what to write down.',
  'Cite the notes you used inline as [[note title]] (the exact title attribute) so the user can open them.'
].join('\n')

const TASK: Record<Exclude<AiAction, 'custom' | 'ask'>, string> = {
  summarize: '아래 글을 핵심만 3~5개 글머리 기호로 요약하세요.',
  improve: '아래 글의 뜻은 그대로 두고 문장을 더 명확하고 자연스럽게 다듬으세요. 형식(목록·제목 등)은 유지하세요.',
  shorter: '아래 글을 핵심을 유지한 채 절반 정도 길이로 줄이세요.',
  longer: '아래 글을 같은 논지로 더 구체적인 설명과 예시를 더해 늘리세요.',
  continue: '아래 글의 흐름과 문체를 이어서 다음 내용을 한두 문단 더 쓰세요. 이미 있는 내용은 반복하지 마세요.',
  translate_en: 'Translate the text below into natural English. Keep the Markdown structure.',
  translate_ko: '아래 글을 자연스러운 한국어로 번역하세요. 마크다운 구조는 유지하세요.',
  action_items: '아래 글에서 해야 할 일을 뽑아 "- [ ] 할 일" 형식의 체크리스트로만 출력하세요. 담당자·기한이 있으면 함께 적으세요.'
}

export interface AiSource {
  title: string
  where: string
  text: string
}

export interface AiPromptInput {
  action: AiAction
  text?: string
  instruction?: string
  sources?: AiSource[]
}

const MAX_TEXT = 60_000
const attr = (s: string): string => s.replace(/"/g, "'")

export function buildAiPrompt(input: AiPromptInput): { system: string; user: string } {
  if (!AI_ACTIONS.includes(input.action)) throw new Error('지원하지 않는 AI 작업입니다.')
  const instruction = input.instruction?.trim() ?? ''

  if (input.action === 'ask') {
    if (!instruction) throw new Error('질문을 입력하세요.')
    const notes = (input.sources ?? [])
      .map((s) => `<note title="${attr(s.title)}" where="${attr(s.where)}">\n${s.text}\n</note>`)
      .join('\n\n')
    return {
      system: SYSTEM_ASK,
      user: `${notes || '(관련 메모 없음)'}\n\n질문: ${instruction}`
    }
  }

  const text = (input.text ?? '').trim().slice(0, MAX_TEXT)
  if (!text && input.action !== 'custom') throw new Error('AI에게 보낼 내용이 없습니다.')
  if (input.action === 'custom' && !instruction) throw new Error('AI에게 할 요청을 입력하세요.')
  const task = input.action === 'custom' ? instruction : TASK[input.action]
  return {
    system: SYSTEM,
    user: text ? `${task}\n\n<text>\n${text}\n</text>` : task
  }
}

/** One line of `claude -p --output-format stream-json --include-partial-messages`. */
export function parseCliLine(line: string): { delta?: string; final?: string; error?: string } {
  let o: {
    type?: string
    is_error?: boolean
    result?: unknown
    event?: { type?: string; delta?: { type?: string; text?: string } }
  }
  try {
    o = JSON.parse(line)
  } catch {
    return {} // stray non-JSON output
  }
  if (o.type === 'stream_event' && o.event?.type === 'content_block_delta' && o.event.delta?.type === 'text_delta') {
    return { delta: o.event.delta.text ?? '' }
  }
  if (o.type === 'result') {
    const text = typeof o.result === 'string' ? o.result : ''
    return o.is_error ? { error: text || 'Claude Code가 요청을 처리하지 못했습니다.' } : { final: text }
  }
  return {}
}

const MAX_SOURCES = 8
const STOPWORDS = new Set(['뭐', '뭐였지', '알려줘', '알려', '어떻게', '무엇', '관련', '대해', '정리', '해줘', '있어', '했지', '는', '은', '이', '가'])

/** Crude keyword retrieval for "ask your notes": title hits ×3, body hits ×1, top 8. */
export function rankNotes(question: string, tasks: TaskWithContext[]): TaskWithContext[] {
  const terms = [...new Set(question.toLowerCase().split(/[\s,.?!()[\]"'·:;]+/).filter((t) => t.length >= 2 && !STOPWORDS.has(t)))]
  if (terms.length === 0) return []
  return tasks
    .map((t) => {
      const title = t.title.toLowerCase()
      const body = t.note.toLowerCase()
      const score = terms.reduce((s, term) => s + (title.includes(term) ? 3 : 0) + (body.includes(term) ? 1 : 0), 0)
      return { t, score }
    })
    .filter((x) => x.score > 0 && x.t.note.trim())
    .sort((a, b) => b.score - a.score || b.t.updated_at.localeCompare(a.t.updated_at))
    .slice(0, MAX_SOURCES)
    .map((x) => x.t)
}
