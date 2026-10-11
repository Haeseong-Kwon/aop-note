import { spawn, execFileSync, type ChildProcess } from 'child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { join } from 'path'
import { app, safeStorage } from 'electron'
import Anthropic from '@anthropic-ai/sdk'
import { loadSettings } from './settings'
import { taskRepo } from './repositories/task.repo'
import { buildAiPrompt, parseCliLine, rankNotes, questionTerms } from './aiPrompts'
import { hasServerFallback } from '@shared/aiModels'
import { searchRepo } from './repositories/search.repo'
import type { AiRequest, AiResult, AiStatus, TaskWithContext } from '@shared/types'

// In-app AI: either the user's logged-in Claude Code CLI (their subscription, no key)
// or the Anthropic API with a key kept in the OS keychain. The key never leaves main.

const MAX_TOKENS = 16_000
const CLI_TIMEOUT_MS = 180_000
const SOURCE_CHARS = 2_500

const keyPath = (): string => join(app.getPath('userData'), 'ai-key.bin')

export function setApiKey(key: string | null): void {
  if (!key) {
    rmSync(keyPath(), { force: true })
    return
  }
  const trimmed = key.trim()
  if (!/^sk-ant-[\w-]{20,}$/.test(trimmed)) throw new Error('Anthropic API 키 형식이 아닙니다 (sk-ant-…).')
  if (!safeStorage.isEncryptionAvailable()) throw new Error('OS 보안 저장소를 사용할 수 없어 키를 저장할 수 없습니다.')
  writeFileSync(keyPath(), safeStorage.encryptString(trimmed))
}

function readApiKey(): string | null {
  try {
    return safeStorage.decryptString(readFileSync(keyPath()))
  } catch {
    return null
  }
}

let cliCache: string | null | undefined

/** Where the claude CLI is looked for when it isn't on the app's (minimal) PATH. */
function cliCandidates(): string[] {
  if (process.platform === 'win32') {
    // Only real executables: a .cmd shim would need a shell, and the prompt is passed as arguments.
    return [join(homedir(), '.local', 'bin', 'claude.exe')]
  }
  return [
    join(homedir(), '.local', 'bin', 'claude'),
    join(homedir(), '.claude', 'local', 'claude'),
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude'
  ]
}

/** Ask the system: `where claude.exe` on Windows, the login shell elsewhere (apps started from Finder get a minimal PATH). */
function cliOnPath(): string | null {
  try {
    const out =
      process.platform === 'win32'
        ? execFileSync('where.exe', ['claude.exe'], { encoding: 'utf8', timeout: 5000, windowsHide: true })
        : execFileSync(process.env.SHELL || '/bin/zsh', ['-lc', 'command -v claude'], { encoding: 'utf8', timeout: 5000 })
    const found = out.split(/\r?\n/)[0].trim()
    return found && existsSync(found) ? found : null
  } catch {
    return null
  }
}

export function findClaudeCli(): string | null {
  if (cliCache !== undefined) return cliCache
  cliCache = cliCandidates().find((p) => existsSync(p)) ?? cliOnPath()
  return cliCache
}

export function aiStatus(): AiStatus {
  const s = loadSettings()
  return { provider: s.aiProvider, model: s.aiModel, hasKey: readApiKey() !== null, cliPath: findClaudeCli() }
}

const running = new Map<string, { cancel: () => void }>()

const MAX_NOTE_SOURCES = 8
const MAX_DOC_SOURCES = 3

/**
 * Notes + documents for "ask": each question term goes through full-text search (ranked,
 * Korean particles stripped); notes matching more terms rank first. Falls back to the
 * keyword scan when search finds nothing (e.g. only 1-character terms).
 */
function retrieve(question: string): {
  notes: TaskWithContext[]
  documents: { id: string; file_name: string; workspace_id: string; workspace_name: string; text: string }[]
} {
  const terms = questionTerms(question)
  const score = new Map<string, number>()
  for (const term of terms) {
    searchRepo.notes(term).slice(0, 30).forEach((hit, rank) => score.set(hit.id, (score.get(hit.id) ?? 0) + 10 - Math.min(rank, 9) / 10))
  }
  const all = taskRepo.listAllWithContext()
  const byId = new Map(all.map((t) => [t.id, t]))
  const ranked = [...score.entries()]
    .sort((a, b) => b[1] - a[1])
    .flatMap(([id]) => byId.get(id) ?? [])
    .filter((t) => t.note.trim())
    .slice(0, MAX_NOTE_SOURCES)
  const notes = ranked.length ? ranked : rankNotes(question, all)

  const docs = new Map<string, { id: string; file_name: string; workspace_id: string; workspace_name: string; text: string }>()
  for (const term of terms) {
    for (const d of searchRepo.documents(term, MAX_DOC_SOURCES)) {
      if (!docs.has(d.id)) docs.set(d.id, { ...d, text: searchRepo.documentText(d.id).slice(0, SOURCE_CHARS) })
    }
  }
  return { notes, documents: [...docs.values()].slice(0, MAX_DOC_SOURCES) }
}

export function cancelAi(id: string): void {
  running.get(id)?.cancel()
  running.delete(id)
}

/** Build the prompt (retrieving notes for "ask"), run it, stream text via onDelta. */
export async function runAi(req: AiRequest, onDelta: (text: string) => void): Promise<AiResult> {
  let sources: AiResult['sources']
  let prompt: { system: string; user: string }
  if (req.action === 'ask') {
    const { notes, documents } = retrieve(req.instruction ?? '')
    sources = [
      ...notes.map((t) => ({ kind: 'note' as const, id: t.id, title: t.title, workspace_id: t.workspace_id, category_id: t.category_id })),
      ...documents.map((d) => ({ kind: 'document' as const, id: d.id, title: d.file_name, workspace_id: d.workspace_id, category_id: null }))
    ]
    prompt = buildAiPrompt({
      action: 'ask',
      instruction: req.instruction,
      sources: [
        ...notes.map((t) => ({ title: t.title, where: `${t.workspace_name} / ${t.category_name}`, text: t.note.slice(0, SOURCE_CHARS) })),
        ...documents.map((d) => ({ title: d.file_name, where: `${d.workspace_name} / 문서`, text: d.text }))
      ]
    })
  } else {
    prompt = buildAiPrompt({ action: req.action, text: req.text, instruction: req.instruction })
  }
  const { aiProvider, aiModel } = loadSettings()
  try {
    const text = aiProvider === 'api' ? await viaApi(req.id, aiModel, prompt, onDelta) : await viaCli(req.id, aiModel, prompt, onDelta)
    return { text: text.trim(), sources }
  } finally {
    running.delete(req.id)
  }
}

async function viaApi(id: string, model: string, prompt: { system: string; user: string }, onDelta: (t: string) => void): Promise<string> {
  const apiKey = readApiKey()
  if (!apiKey) throw new Error('설정 → AI에서 Anthropic API 키를 먼저 저장하세요.')
  const client = new Anthropic({ apiKey })
  const base = {
    model,
    max_tokens: MAX_TOKENS,
    system: prompt.system,
    messages: [{ role: 'user' as const, content: prompt.user }]
  }
  const finish = (stopReason: string | null, content: { type: string; text?: string }[]): string => {
    if (stopReason === 'refusal') throw new Error('Claude가 이 요청은 처리하지 않았습니다. 내용을 바꿔 다시 시도하세요.')
    return content.map((c) => (c.type === 'text' ? (c.text ?? '') : '')).join('')
  }
  try {
    // Short writing tasks: medium effort (set explicitly — defaults differ per model).
    if (hasServerFallback(model)) {
      // A policy decline is retried server-side on a fallback model inside the same call.
      const stream = client.beta.messages.stream({
        ...base,
        output_config: { effort: 'medium' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default'
      })
      running.set(id, { cancel: () => stream.abort() })
      stream.on('text', onDelta)
      const message = await stream.finalMessage()
      return finish(message.stop_reason, message.content)
    }
    const stream = client.messages.stream({ ...base, output_config: { effort: 'medium' } })
    running.set(id, { cancel: () => stream.abort() })
    stream.on('text', onDelta)
    const message = await stream.finalMessage()
    return finish(message.stop_reason, message.content)
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) throw new Error('API 키가 올바르지 않습니다. 설정에서 다시 저장하세요.')
    if (error instanceof Anthropic.RateLimitError) throw new Error('요청이 너무 많습니다. 잠시 후 다시 시도하세요.')
    if (error instanceof Anthropic.APIConnectionError) throw new Error('Anthropic API에 연결하지 못했습니다. 네트워크를 확인하세요.')
    if (error instanceof Anthropic.APIUserAbortError) throw new Error('취소했습니다.')
    if (error instanceof Anthropic.APIError) throw new Error(`AI 요청 실패 (${error.status ?? '오류'}): ${error.message}`)
    throw error
  }
}

function viaCli(id: string, model: string, prompt: { system: string; user: string }, onDelta: (t: string) => void): Promise<string> {
  const cli = findClaudeCli()
  if (!cli) {
    return Promise.reject(new Error('Claude Code CLI를 찾지 못했습니다. 설치·로그인하거나 설정에서 API 키 방식을 쓰세요.'))
  }
  // Text generation only: no tools, no user/project settings (so no hooks — including
  // this app's own SessionStart hook), no MCP servers, no saved session.
  const args = [
    '-p',
    '--output-format', 'stream-json',
    '--include-partial-messages',
    '--verbose',
    '--tools', '',
    '--setting-sources', '',
    '--strict-mcp-config',
    '--no-session-persistence',
    '--model', model,
    '--system-prompt', prompt.system
  ]
  return new Promise((resolve, reject) => {
    const child: ChildProcess = spawn(cli, args, { cwd: tmpdir(), env: process.env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    let buffered = ''
    let streamed = ''
    let stderr = ''
    let settled = false
    const done = (fn: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
    }
    const timer = setTimeout(() => {
      child.kill()
      done(() => reject(new Error('AI 응답이 너무 오래 걸려 중단했습니다.')))
    }, CLI_TIMEOUT_MS)
    running.set(id, {
      cancel: () => {
        child.kill()
        done(() => reject(new Error('취소했습니다.')))
      }
    })
    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      buffered += chunk
      const lines = buffered.split('\n')
      buffered = lines.pop() ?? ''
      for (const line of lines) {
        const r = parseCliLine(line)
        if (r.delta) {
          streamed += r.delta
          onDelta(r.delta)
        }
        if (r.final !== undefined) done(() => resolve(r.final || streamed))
        if (r.error) done(() => reject(new Error(r.error)))
      }
    })
    child.stderr?.on('data', (c) => (stderr += String(c)))
    child.on('error', (e) => done(() => reject(new Error(`Claude Code를 실행하지 못했습니다: ${e.message}`))))
    child.on('close', (code) => {
      done(() =>
        code === 0 && streamed ? resolve(streamed) : reject(new Error(stderr.trim().split('\n').pop() || `Claude Code가 종료됐습니다 (코드 ${code}). 터미널에서 claude 로그인 상태를 확인하세요.`))
      )
    })
    // Prompt via stdin: no argv length limit, and note text never shows up in `ps`.
    child.stdin?.end(prompt.user)
  })
}
