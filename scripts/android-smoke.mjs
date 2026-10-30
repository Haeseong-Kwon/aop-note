// Smoke test for the Android build on a running emulator/device (npm run android:smoke).
// Installs the debug APK, drives the WebView through Playwright's Android support, and checks that
// data written in one launch is still there after the app is killed and relaunched.
import { execSync } from 'node:child_process'
import { _android } from 'playwright'

const APP = 'com.aop.note'
const APK = 'android/app/build/outputs/apk/debug/app-debug.apk'
const shots = process.env.SHOTS_DIR

const adb = (args) => execSync(`adb ${args}`, { encoding: 'utf8' }).trim()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const [device] = await _android.devices()
if (!device) throw new Error('no emulator/device connected (adb devices)')
// It wipes the app's data (pm clear): never on a real phone.
if (adb('shell getprop ro.boot.qemu') !== '1') throw new Error('android:smoke runs on an emulator only (it clears the app data)')

/** Fresh process each time; attach to the WebView of that process (not a stale one from the last run). */
async function launch() {
  adb(`shell am force-stop ${APP}`)
  adb(`shell am start -n ${APP}/.MainActivity`)
  let webView
  for (let i = 0; i < 120 && !webView; i++) {
    await sleep(250)
    const pid = Number(execSync(`adb shell pidof ${APP} || true`, { encoding: 'utf8' }).trim())
    webView = device.webViews().find((w) => w.pkg() === APP && w.pid() === pid)
  }
  if (!webView) throw new Error('WebView did not come up')
  const page = await webView.page()
  await page.waitForFunction(() => window.api !== undefined, null, { timeout: 20000 })
  return page
}

const assert = (ok, message) => {
  if (!ok) throw new Error(`FAIL: ${message}`)
  console.log(`ok - ${message}`)
}

adb(`install -r ${APK}`)
adb(`shell pm clear ${APP}`)

// Launch 1: fresh install creates its DB, then we write through the same API the UI uses.
let page = await launch()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
const marker = `smoke-${Date.now()}`
const created = await page.evaluate(async (title) => {
  const desk = await window.api.workspace.create({ name: '모바일 테스트' })
  const cat = await window.api.category.create({ workspace_id: desk.id, name: '일반' })
  const task = await window.api.task.create({ workspace_id: desk.id, category_id: cat.id, title, note: '안드로이드에서 작성한 메모' })
  return { desk: desk.id, task: task.id }
}, marker)
assert(created.task, 'created a desk, category and memo')
const hits = await page.evaluate((q) => window.api.search.query(q), marker)
assert(JSON.stringify(hits).includes(marker), 'full-text search (FTS5) finds the memo')
const image = await page.evaluate(async (task) => {
  const url = await window.api.attachment.addBytes(task, 'dot.png', new Uint8Array([137, 80, 78, 71, 1, 2, 3]).buffer)
  const shown = await window.aopResolveFileUrl(url)
  return { url, shown, size: (await (await (window.CapacitorWebFetch ?? fetch)(shown)).arrayBuffer()).byteLength }
}, created.task)
assert(image.url.startsWith('aop-file:') && image.shown.startsWith('blob:') && image.size === 7, 'pasted image is stored and displayable')
const doc = await page.evaluate(async (desk) => {
  // A file from the picker (<input type=file>) uploaded to the desk's 문서함, as DocumentsView does.
  const file = new File(['# 회의록\n모바일 업로드'], '회의록.md', { type: 'text/markdown' })
  const path = window.api.getPathForFile(file)
  const att = await window.api.attachment.upload({ workspace_id: desk, folder_id: null, source_path: path, file_name: file.name })
  return { name: att.file_name, render: await window.api.attachment.render(att.id) }
}, created.desk)
assert(doc.name === '회의록.md' && doc.render.kind === 'text' && doc.render.text.includes('모바일 업로드'), 'picked file uploads to the document box and opens')
await sleep(2000) // DB save is debounced
if (shots) await page.screenshot({ path: `${shots}/launch1.png` })

// Launch 2: after a kill, everything is read back from storage.
page = await launch()
page.on('pageerror', (e) => errors.push(e.message))
const tasks = await page.evaluate((desk) => window.api.task.listByWorkspace(desk), created.desk)
assert(tasks.some((t) => t.title === marker), 'memo survives an app restart')
const settings = await page.evaluate(() => window.api.settings.update({ dueNotifications: false }))
assert(settings.dueNotifications === false, 'settings write')
await sleep(1000) // file writes reach storage asynchronously (a reload skips the app's pause flush)
await page.reload()
await page.waitForFunction(() => window.api !== undefined)
const again = await page.evaluate(() => window.api.settings.get())
assert(again.dueNotifications === false, 'settings persist (fs shim → app storage)')
if (shots) await page.screenshot({ path: `${shots}/launch2.png` })

// Device sync through the Syncthing folder: the phone publishes its snapshot, then a
// simulated desktop (the phone's snapshot, re-labelled and edited) is merged back in.
// A scratch folder, never Syncthing's real one: test rows must not reach a paired desktop.
const SYNC_ROOT = '/storage/emulated/0/AOP-smoke-sync'
const DEVICES = `${SYNC_ROOT}/AOP Note Sync/devices`
adb(`shell appops set ${APP} MANAGE_EXTERNAL_STORAGE allow`)
adb(`shell rm -rf "'${SYNC_ROOT}/AOP Note Sync'"`)
adb(`shell mkdir -p ${SYNC_ROOT}`)
await page.evaluate((root) => window.api.settings.update({ syncPath: root }), SYNC_ROOT)
const first = await page.evaluate(() => window.api.data.syncNow())
assert(first.exported, 'phone publishes its snapshot to the sync folder')
const published = adb(`shell ls "'${DEVICES}'"`).split(/\s+/).filter((f) => f.endsWith('.json'))
assert(published.length === 1, `snapshot file on shared storage (${published[0]})`)

const local = `${process.env.TMPDIR ?? '/tmp'}/aop-smoke-snapshot.json`
adb(`pull "${DEVICES}/${published[0]}" ${local}`)
const { readFileSync, writeFileSync } = await import('node:fs')
const snap = JSON.parse(readFileSync(local, 'utf8'))
const later = new Date(Date.now() + 60_000).toISOString()
snap.device = 'desktop-sim'
snap.tables.tasks = snap.tables.tasks.map((t) => (t.title === marker ? { ...t, title: `${marker}-desktop`, updated_at: later } : t))
writeFileSync(local, JSON.stringify(snap))
adb(`push ${local} "${DEVICES}/desktop-sim.json"`)
const second = await page.evaluate(() => window.api.data.syncNow())
assert(second.merged >= 1 && second.devices === 1, `phone merges the desktop's edit (merged ${second.merged})`)
const merged = await page.evaluate((desk) => window.api.task.listByWorkspace(desk), created.desk)
assert(merged.some((t) => t.title === `${marker}-desktop`), 'merged edit is visible on the phone')
await page.evaluate(() => window.api.settings.update({ syncPath: '' }))
adb(`shell rm -rf ${SYNC_ROOT}`)

// Phone shell: home → desk → add a task → its page → hardware back, twice.
page = await launch()
page.on('pageerror', (e) => errors.push(e.message))
await page.getByText('모바일 테스트').first().click()
const taskTitle = `ui-${Date.now()}`
await page.getByPlaceholder('작업 추가').fill(taskTitle)
await page.keyboard.press('Enter')
await page.getByText(taskTitle).first().click()
await page.waitForFunction((t) => [...document.querySelectorAll('input')].some((i) => i.value === t), taskTitle)
assert(true, 'tapping a task opens its page')
adb('shell input keyevent KEYCODE_BACK')
await page.getByPlaceholder('작업 추가').waitFor()
assert(true, 'back button returns to the desk')
adb('shell input keyevent KEYCODE_BACK')
await page.getByRole('button', { name: '새로 만들기' }).waitFor()
assert(true, 'back again returns home (tab bar shown)')
// The tab bar hides exactly when the keyboard takes screen height. Gboard sometimes comes up as a
// floating toolbar instead (after key events from automation), which covers nothing: bar stays.
const fullHeight = await page.evaluate(() => window.visualViewport.height)
await page.getByRole('button', { name: '검색', exact: true }).click()
await sleep(1500)
const shrank = await page.evaluate((full) => window.visualViewport.height < full * 0.8, fullHeight)
const barShown = await page.getByRole('button', { name: '홈', exact: true }).isVisible()
assert(barShown === !shrank, `tab bar ${shrank ? 'steps aside for the keyboard' : 'stays (keyboard covers nothing)'}`)
adb('shell input keyevent KEYCODE_BACK') // closes the keyboard
await page.getByRole('button', { name: '홈', exact: true }).waitFor()
assert(true, 'tab bar shown once the keyboard is closed')

assert(errors.length === 0, `no uncaught page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`)
await device.close()
