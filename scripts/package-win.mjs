#!/usr/bin/env node
// Build the Windows installer (x64 NSIS) — from macOS or Windows.
//
// better-sqlite3 is a native module and electron-builder can't cross-compile it, so for
// the duration of packaging we swap in its official prebuilt Windows binary for this
// Electron version, then put the local one back (even if packaging fails).
//
// Usage: npm run package:win   →   dist/aop-note-Setup-<version>.exe
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const root = new URL('..', import.meta.url).pathname
const sqliteDir = join(root, 'node_modules', 'better-sqlite3')
const binary = join(sqliteDir, 'build', 'Release', 'better_sqlite3.node')
const electronVersion = require('electron/package.json').version
const run = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })

const saved = join(mkdtempSync(join(tmpdir(), 'aop-sqlite-')), 'better_sqlite3.node')
if (existsSync(binary)) copyFileSync(binary, saved)

try {
  run('npm', ['run', 'build'])
  console.log(`\n==> better-sqlite3: Windows x64 prebuilt for Electron ${electronVersion}`)
  run(process.execPath, [require.resolve('prebuild-install/bin.js'), '--runtime', 'electron', '--target', electronVersion, '--platform', 'win32', '--arch', 'x64', '--force'], sqliteDir)
  console.log('\n==> electron-builder --win --x64')
  run('npx', ['electron-builder', '--win', '--x64'])
} finally {
  if (existsSync(saved)) copyFileSync(saved, binary)
  rmSync(join(saved, '..'), { recursive: true, force: true })
  console.log('\n==> restored the local better-sqlite3 binary')
}
