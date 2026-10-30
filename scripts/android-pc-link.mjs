// End-to-end PC ↔ phone sync (npm run android:pc-link): the built desktop app (npm run build) on a
// throwaway data folder, and the debug APK on an emulator (npm run android:apk). Pairs through both
// UIs with the code the desktop shows, then checks memos and files travel both ways and that a
// forgotten phone is locked out. The emulator reaches this computer at 10.0.2.2.
import { execSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _android, _electron } from 'playwright'

const APP = 'com.aop.note'
const APK = 'android/app/build/outputs/apk/debug/app-debug.apk'
const shots = process.env.SHOTS_DIR

const adb = (args) => execSync(`adb ${args}`, { encoding: 'utf8' }).trim()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const assert = (ok, message) => {
  if (!ok) throw new Error(`FAIL: ${message}`)
  console.log(`ok - ${message}`)
}
/** Poll until fn() is truthy (sync rounds are debounced / periodic). */
async function eventually(fn, message, ms = 30_000) {
  const end = Date.now() + ms
  for (;;) {
    const value = await fn()
    if (value) return assert(true, message)
    if (Date.now() > end) assert(false, message)
    await sleep(500)
  }
}

const [device] = await _android.devices()
if (!device) throw new Error('no emulator connected (adb devices)')
if (adb('shell getprop ro.boot.qemu') !== '1') throw new Error('android:pc-link runs on an emulator only (it clears the app data)')

// ---- desktop ----
const desktop = await _electron.launch({ args: ['.'], env: { ...process.env, AOP_NOTE_USER_DATA: mkdtempSync(join(tmpdir(), 'aop-pclink-')) } })
const pc = await desktop.firstWindow()
await pc.waitForFunction(() => window.api !== undefined)
const seeded = await pc.evaluate(async () => {
  const desk = await window.api.workspace.create({ name: '공유 데스크' })
  const cat = await window.api.category.create({ workspace_id: desk.id, name: '일반' })
  const task = await window.api.task.create({ workspace_id: desk.id, category_id: cat.id, title: 'PC에서 쓴 메모', note: '' })
  return { desk: desk.id, cat: cat.id, task: task.id }
})
await pc.reload()
await pc.locator('aside').getByText('설정', { exact: true }).click()
await pc.getByRole('heading', { name: '휴대폰 연결' }).waitFor()
await pc.getByRole('button', { name: '켜기', exact: true }).click()
await pc.getByRole('button', { name: '새 휴대폰 연결' }).click()
const codeEl = pc.getByText(/^[2-9A-Z]{4}-[2-9A-Z]{4}-[2-9A-Z]{4}$/)
await codeEl.waitFor()
const code = (await codeEl.textContent()).trim()
assert(true, `desktop shows a pairing code (${code})`)
if (shots) await pc.screenshot({ path: `${shots}/pc-pairing.png` })

// ---- phone ----
adb(`install -r ${APK}`)
adb(`shell pm clear ${APP}`)
adb(`shell am start -n ${APP}/.MainActivity`)
let webView
for (let i = 0; i < 120 && !webView; i++) {
  await sleep(250)
  const pid = Number(execSync(`adb shell pidof ${APP} || true`, { encoding: 'utf8' }).trim())
  webView = device.webViews().find((w) => w.pkg() === APP && w.pid() === pid)
}
if (!webView) throw new Error('WebView did not come up')
const phone = await webView.page()
const errors = []
phone.on('pageerror', (e) => errors.push(e.message))
await phone.waitForFunction(() => window.api !== undefined)

await phone.getByText('PC와 연결하기').click()
await phone.getByPlaceholder(/PC 주소/).fill('10.0.2.2')
await phone.getByPlaceholder(/연결 코드/).fill(code.toLowerCase())
await phone.getByRole('button', { name: '연결', exact: true }).click()
await phone.getByRole('button', { name: '지금 동기화' }).waitFor({ timeout: 30_000 })
assert(true, 'phone pairs through its settings screen')
if (shots) execSync(`adb exec-out screencap -p > ${shots}/phone-linked.png`)

await eventually(() => phone.evaluate((id) => window.api.task.listByWorkspace(id).then((t) => t.some((x) => x.title === 'PC에서 쓴 메모')), seeded.desk), "desktop's memo arrives on the phone")
await eventually(() => pc.getByText(/마지막 동기화|아직 동기화 전/).first().isVisible(), 'desktop lists the paired phone')
assert((await pc.evaluate(() => window.api.lan.status())).pairing === null, 'pairing code spent')

// Phone edit → desktop, without pressing anything (debounced round after the write).
const fromPhone = await phone.evaluate(async (s) => {
  const t = await window.api.task.create({ workspace_id: s.desk, category_id: s.cat, title: '폰에서 쓴 메모', note: '' })
  await window.api.attachment.addBytes(t.id, '폰메모.txt', new TextEncoder().encode('휴대폰 첨부').buffer)
  return t.id
}, seeded)
await eventually(() => pc.evaluate((id) => window.api.task.listByWorkspace(id).then((t) => t.some((x) => x.title === '폰에서 쓴 메모')), seeded.desk), "phone's new memo reaches the desktop on its own")
await eventually(
  () =>
    pc.evaluate(async (id) => {
      const [att] = await window.api.attachment.listByTask(id)
      if (!att) return false
      const r = await window.api.attachment.render(att.id)
      return r.kind === 'text' && r.text.includes('휴대폰 첨부')
    }, fromPhone),
  "phone's attachment file reaches the desktop"
)

// Desktop edit → phone via "지금 동기화".
await pc.evaluate((id) => window.api.task.update({ id, title: 'PC에서 고친 제목' }), seeded.task)
await phone.getByRole('button', { name: '지금 동기화' }).click()
await eventually(() => phone.evaluate((id) => window.api.task.listByWorkspace(id).then((t) => t.some((x) => x.title === 'PC에서 고친 제목')), seeded.desk), "desktop's edit reaches the phone")

// Forgetting the phone on the desktop locks it out.
await pc.evaluate((id) => window.api.lan.forget(id), (await pc.evaluate(() => window.api.lan.status())).devices[0].id)
const refused = await phone.evaluate(() => window.api.pcLink.syncNow().then(() => '', (e) => String(e.message ?? e)))
assert(refused.includes('연결이 해제'), `forgotten phone is refused (${refused})`)

assert(errors.length === 0, `no uncaught page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`)
await desktop.close()
await device.close()
