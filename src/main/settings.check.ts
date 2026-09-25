import assert from 'node:assert'
import { writeFileSync } from 'fs'
import { loadSettings, saveSettings, settingsPath, DEFAULT_SETTINGS } from './settings'

assert.deepEqual(loadSettings(), DEFAULT_SETTINGS, 'no file yet → defaults')

const saved = saveSettings({ dueNotifications: false })
assert.equal(saved.dueNotifications, false)
assert.equal(saved.globalShortcut, DEFAULT_SETTINGS.globalShortcut, 'other keys untouched')
assert.deepEqual(loadSettings(), saved, 'persisted')

// Values arrive from the renderer: unknown keys and wrong types are dropped.
const cleaned = saveSettings({ globalShortcut: 'yes', evil: true } as never)
assert.equal(cleaned.globalShortcut, DEFAULT_SETTINGS.globalShortcut)
assert.ok(!('evil' in cleaned))

writeFileSync(settingsPath(), '{ not json')
assert.deepEqual(loadSettings(), DEFAULT_SETTINGS, 'corrupt file → defaults, no crash')

console.log('settings: all assertions passed')
