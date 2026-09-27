import assert from 'node:assert'
import { withHook, withoutHook, hasHook } from './claudeHook'

const CMD = 'ELECTRON_RUN_AS_NODE=1 "/Applications/aop-note.app/Contents/MacOS/aop-note" "/x/server.js" --brief # aop-note'

// Existing user settings — other hooks and keys must survive untouched.
const user = {
  model: 'opus',
  hooks: {
    SessionStart: [{ hooks: [{ type: 'command', command: 'echo hi' }] }],
    PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'guard.sh' }] }]
  }
}

const on = withHook(user, CMD)
assert.equal(hasHook(on), true)
assert.equal(hasHook(user), false)
assert.equal(on.model, 'opus')
assert.deepEqual(on.hooks.PreToolUse, user.hooks.PreToolUse)
assert.equal(on.hooks.SessionStart.length, 2, 'appended next to the user\'s own SessionStart hook')
assert.equal(user.hooks.SessionStart.length, 1, 'input not mutated')

// Idempotent: enabling twice (or with a new app path) keeps exactly one entry.
const twice = withHook(on, CMD.replace('/x/', '/y/'))
assert.equal(twice.hooks.SessionStart.filter((e: { hooks: { command: string }[] }) => e.hooks[0].command.includes('# aop-note')).length, 1)

// Disabling removes only ours; an emptied event key goes away.
const off = withoutHook(twice)
assert.equal(hasHook(off), false)
assert.deepEqual(off.hooks.SessionStart, user.hooks.SessionStart)
assert.deepEqual(withoutHook(withHook({}, CMD)), { hooks: {} })

console.log('claude hook: all assertions passed')

// --- launch commands per platform (Windows: cmd-quoted MCP command, PowerShell hook) ---
import { mcpAddCommand, hookSpec } from './claudeCommands'
const mac = { exe: "/Applications/aop-note.app/Contents/MacOS/aop-note", script: "/A/app.asar/out/mcp/server.js", dataDir: "/Users/o'k/Library/Application Support/aop-note", platform: 'darwin' as const }
assert.equal(
  mcpAddCommand(mac),
  `claude mcp add aop-note --scope user -e ELECTRON_RUN_AS_NODE=1 -e AOP_NOTE_DATA='/Users/o'\\''k/Library/Application Support/aop-note' -- '/Applications/aop-note.app/Contents/MacOS/aop-note' '/A/app.asar/out/mcp/server.js'`
)
assert.deepEqual(hookSpec(mac), {
  command: `ELECTRON_RUN_AS_NODE=1 AOP_NOTE_DATA='/Users/o'\\''k/Library/Application Support/aop-note' '/Applications/aop-note.app/Contents/MacOS/aop-note' '/A/app.asar/out/mcp/server.js' --brief`
})
const win = { exe: 'C:\\Users\\Kim O\'Neil\\AppData\\Local\\Programs\\aop-note\\aop-note.exe', script: 'C:\\Users\\Kim O\'Neil\\AppData\\Local\\Programs\\aop-note\\resources\\app.asar\\out\\mcp\\server.js', dataDir: 'C:\\Users\\Kim O\'Neil\\AppData\\Roaming\\aop-note', platform: 'win32' as const }
assert.equal(
  mcpAddCommand(win),
  `claude mcp add aop-note --scope user -e ELECTRON_RUN_AS_NODE=1 -e "AOP_NOTE_DATA=${win.dataDir}" -- "${win.exe}" "${win.script}"`
)
const winHook = hookSpec(win)
assert.equal(winHook.shell, 'powershell', 'Claude Code would otherwise pick Git Bash or PowerShell depending on the machine')
assert.equal(
  winHook.command,
  `$env:ELECTRON_RUN_AS_NODE='1'; $env:AOP_NOTE_DATA='C:\\Users\\Kim O''Neil\\AppData\\Roaming\\aop-note'; & 'C:\\Users\\Kim O''Neil\\AppData\\Local\\Programs\\aop-note\\aop-note.exe' 'C:\\Users\\Kim O''Neil\\AppData\\Local\\Programs\\aop-note\\resources\\app.asar\\out\\mcp\\server.js' --brief`
)
const withShell = withHook(user, winHook.command, winHook.shell)
const ours = withShell.hooks.SessionStart.at(-1) as { hooks: { shell?: string; command: string }[] }
assert.equal(ours.hooks[0].shell, 'powershell')
assert.ok(ours.hooks[0].command.endsWith('# aop-note'), 'marker is a comment in PowerShell too')
// Codex CLI (GPT models) takes the same stdio server: codex mcp add … --env … -- <command>
import { codexAddCommand } from './claudeCommands'
assert.equal(
  codexAddCommand(mac),
  `codex mcp add aop-note --env ELECTRON_RUN_AS_NODE=1 --env AOP_NOTE_DATA='/Users/o'\\''k/Library/Application Support/aop-note' -- '/Applications/aop-note.app/Contents/MacOS/aop-note' '/A/app.asar/out/mcp/server.js'`
)
assert.equal(
  codexAddCommand(win),
  `codex mcp add aop-note --env ELECTRON_RUN_AS_NODE=1 --env "AOP_NOTE_DATA=${win.dataDir}" -- "${win.exe}" "${win.script}"`
)
console.log('claude commands: all assertions passed')
