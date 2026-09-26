import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'

// Claude Code SessionStart hook: at the start of every session, the brief for the
// session's folder (if a desk is linked to it) is added to Claude's context.
// We edit the user's ~/.claude/settings.json, so: only on an explicit toggle, merge
// instead of overwrite, back the file up once, and refuse to touch invalid JSON.

const MARKER = '# aop-note' // shell comment identifying our entry; ignored when run

interface HookEntry {
  matcher?: string
  hooks: { type: string; command: string }[]
}
type Settings = Record<string, unknown> & { hooks?: Record<string, HookEntry[]> }

const isOurs = (e: HookEntry): boolean => e.hooks?.some((h) => h.command?.includes(MARKER)) ?? false

export function hasHook(settings: Settings): boolean {
  return (settings.hooks?.SessionStart ?? []).some(isOurs)
}

/** New settings with exactly one AOP Note SessionStart entry (replacing an older one). */
export function withHook(settings: Settings, command: string): Settings & { hooks: Record<string, HookEntry[]> } {
  const hooks = settings.hooks ?? {}
  const others = (hooks.SessionStart ?? []).filter((e) => !isOurs(e))
  const ours: HookEntry = { hooks: [{ type: 'command', command: command.includes(MARKER) ? command : `${command} ${MARKER}` }] }
  return { ...settings, hooks: { ...hooks, SessionStart: [...others, ours] } }
}

/** New settings without our entry; drops SessionStart if it becomes empty. */
export function withoutHook(settings: Settings): Settings & { hooks: Record<string, HookEntry[]> } {
  const { SessionStart = [], ...rest } = settings.hooks ?? {}
  const kept = SessionStart.filter((e) => !isOurs(e))
  return { ...settings, hooks: kept.length ? { ...rest, SessionStart: kept } : rest }
}

// ---- file IO ----

export const claudeSettingsPath = (): string =>
  join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'settings.json')

function readSettings(path: string): Settings {
  if (!existsSync(path)) return {}
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Settings
  } catch {
    /* fall through */
  }
  throw new Error(`${path} 파일을 해석할 수 없어 건드리지 않았습니다. JSON 형식을 확인하세요.`)
}

export function isHookInstalled(): boolean {
  try {
    return hasHook(readSettings(claudeSettingsPath()))
  } catch {
    return false
  }
}

export function setHookInstalled(enabled: boolean, command: string): boolean {
  const path = claudeSettingsPath()
  const current = readSettings(path)
  const next = enabled ? withHook(current, command) : withoutHook(current)
  const backup = `${path}.aop-note-backup`
  if (existsSync(path) && !existsSync(backup)) copyFileSync(path, backup) // first edit only
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(next, null, 2) + '\n')
  return hasHook(next)
}
