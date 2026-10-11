import { _electron as electron } from '@playwright/test'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
const app = await electron.launch({ args: ['.'], cwd: process.cwd(), env: { ...process.env, AOP_NOTE_USER_DATA: mkdtempSync(join(tmpdir(), 'aop-dbg-')) } })
app.process().stdout.on('data', (d) => process.stdout.write('[main] ' + d))
app.process().stderr.on('data', (d) => process.stdout.write('[main-err] ' + d))
const page = await app.firstWindow()
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
page.on('crash', () => console.log('CRASH'))
page.on('close', () => console.log('CLOSE'))
page.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text()))
await page.waitForTimeout(1500)
await page.evaluate(async () => { const d = await window.api.workspace.create({ name: 'A', icon: '🚀' }) })
await page.waitForTimeout(1000)
await page.reload()
await page.waitForTimeout(2000)
console.log('alive', await page.evaluate(() => document.title))
await app.close()
