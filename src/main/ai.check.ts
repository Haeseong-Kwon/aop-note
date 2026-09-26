import assert from 'node:assert'
import { buildAiPrompt, parseCliLine, rankNotes, AI_ACTIONS } from './aiPrompts'
import type { TaskWithContext } from '@shared/types'

// --- prompts: the text to work on is fenced, the instruction is explicit ---
const sum = buildAiPrompt({ action: 'summarize', text: '회의에서 A안으로 결정. 일정은 10월.' })
assert.match(sum.system, /한국어/)
assert.match(sum.user, /<text>\n회의에서 A안으로 결정\. 일정은 10월\.\n<\/text>/)
assert.match(sum.user, /요약/)

const custom = buildAiPrompt({ action: 'custom', text: '초안', instruction: '더 공손하게' })
assert.match(custom.user, /더 공손하게/)
assert.throws(() => buildAiPrompt({ action: 'custom', text: 'x' }), /요청/)
assert.throws(() => buildAiPrompt({ action: 'summarize', text: '   ' }), /내용/)
assert.throws(() => buildAiPrompt({ action: 'hack' as never, text: 'x' }), /작업/)

const ask = buildAiPrompt({
  action: 'ask',
  instruction: '배포 절차가 뭐였지?',
  sources: [{ title: '런북', where: '개발 / 운영', text: '테스트 → 스테이징 → 운영' }]
})
assert.match(ask.user, /<note title="런북" where="개발 \/ 운영">\n테스트 → 스테이징 → 운영\n<\/note>/)
assert.match(ask.system, /\[\[/, 'answers cite notes as [[title]]')
assert.ok(AI_ACTIONS.includes('action_items'))

// --- Claude Code CLI stream-json lines ---
assert.deepEqual(
  parseCliLine('{"type":"stream_event","event":{"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"안녕"}}}'),
  { delta: '안녕' }
)
assert.deepEqual(parseCliLine('{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"…"}}}'), {})
assert.deepEqual(parseCliLine('{"type":"result","subtype":"success","is_error":false,"result":"완료"}'), { final: '완료' })
assert.deepEqual(parseCliLine('{"type":"result","subtype":"error_during_execution","is_error":true,"result":"Not logged in"}'), { error: 'Not logged in' })
assert.deepEqual(parseCliLine('not json'), {})

// --- retrieval for "ask your notes": title hits outrank body hits; unrelated notes excluded ---
const note = (id: string, title: string, body: string): TaskWithContext =>
  ({ id, title, note: body, workspace_name: '개발', category_name: '문서', updated_at: '2026-09-01' }) as TaskWithContext
const ranked = rankNotes('배포 절차 알려줘', [
  note('a', '점심 메뉴', '김치찌개'),
  note('b', '회의록', '다음 주 배포 일정 논의'),
  note('c', '배포 절차 런북', '테스트 → 스테이징 → 운영'),
  note('d', '빈 메모', '')
])
assert.deepEqual(ranked.map((t) => t.id), ['c', 'b'])

console.log('ai: all assertions passed')
