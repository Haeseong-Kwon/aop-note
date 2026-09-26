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
