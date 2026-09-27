// Shell commands that make Claude Code run this app's MCP server / session brief.
// Both launch the app's own Electron binary in Node mode (ELECTRON_RUN_AS_NODE), so the
// bundled SQLite module matches. Quoting follows the shell each command runs in.

export interface LaunchSpec {
  /** The app binary (process.execPath). */
  exe: string
  /** out/mcp/server.js inside the app. */
  script: string
  /** userData, so the server opens the same database. */
  dataDir: string
  platform: NodeJS.Platform
}

export interface HookSpec {
  command: string
  /** Pinned on Windows: Claude Code would otherwise use Git Bash if present, else PowerShell. */
  shell?: 'powershell'
}

const posix = (v: string): string => `'${v.replace(/'/g, `'\\''`)}'`
const powershell = (v: string): string => `'${v.replace(/'/g, "''")}'`
// Windows paths can't contain double quotes, so plain double quoting is safe for cmd.
const cmd = (v: string): string => `"${v}"`

/** The one-line `claude mcp add …` the user pastes (Windows: into 명령 프롬프트 / cmd). */
export function mcpAddCommand(s: LaunchSpec): string {
  const base = 'claude mcp add aop-note --scope user -e ELECTRON_RUN_AS_NODE=1'
  if (s.platform === 'win32') return `${base} -e ${cmd(`AOP_NOTE_DATA=${s.dataDir}`)} -- ${cmd(s.exe)} ${cmd(s.script)}`
  return `${base} -e AOP_NOTE_DATA=${posix(s.dataDir)} -- ${posix(s.exe)} ${posix(s.script)}`
}

/** The same server for OpenAI's Codex CLI (GPT models), which also speaks MCP over stdio. */
export function codexAddCommand(s: LaunchSpec): string {
  const base = 'codex mcp add aop-note --env ELECTRON_RUN_AS_NODE=1'
  if (s.platform === 'win32') return `${base} --env ${cmd(`AOP_NOTE_DATA=${s.dataDir}`)} -- ${cmd(s.exe)} ${cmd(s.script)}`
  return `${base} --env AOP_NOTE_DATA=${posix(s.dataDir)} -- ${posix(s.exe)} ${posix(s.script)}`
}

/** SessionStart hook that prints the brief for the session's folder. */
export function hookSpec(s: LaunchSpec): HookSpec {
  if (s.platform === 'win32') {
    return {
      command: `$env:ELECTRON_RUN_AS_NODE='1'; $env:AOP_NOTE_DATA=${powershell(s.dataDir)}; & ${powershell(s.exe)} ${powershell(s.script)} --brief`,
      shell: 'powershell'
    }
  }
  return { command: `ELECTRON_RUN_AS_NODE=1 AOP_NOTE_DATA=${posix(s.dataDir)} ${posix(s.exe)} ${posix(s.script)} --brief` }
}
