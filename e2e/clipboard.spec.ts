import { execSync } from 'child_process'
import type { ElectronApplication, Page } from '@playwright/test'
import { test, expect, createDesk } from './app'

// Real OS keystrokes: the bug lives in macOS IME + menu key equivalents, which Playwright's
// synthetic keys bypass. Needs macOS, Accessibility permission and a Korean input source.
test.skip(process.platform !== 'darwin', 'macOS IME only')

const osa = (...lines: string[]): void => {
  execSync(`osascript ${lines.map((l) => `-e '${l}'`).join(' ')}`)
}
const front = (app: ElectronApplication): string =>
  `tell application "System Events" to set frontmost of (first process whose unix id is ${app.process().pid}) to true`
const cmd = (code: number): string => `tell application "System Events" to key code ${code} using command down`
const KEY = { a: 0, c: 8, v: 9, r: 15, k: 40 }

/** Types "가" via the Korean IME, leaving it mid-composition. Skips if no Korean input source. */
async function composeGa(page: Page, app: ElectronApplication): Promise<void> {
  const editor = page.locator('.bn-editor').first()
  for (let attempt = 0; attempt < 2; attempt++) {
    osa(front(app), 'delay 0.3', `tell application "System Events" to key code ${KEY.r}`, `tell application "System Events" to key code ${KEY.k}`)
    await page.waitForTimeout(200)
    if ((await editor.innerText()).includes('가')) return
    await page.keyboard.press('Backspace')
    await page.keyboard.press('Backspace')
    osa('tell application "System Events" to key code 49 using control down', 'delay 0.3') // switch input source
  }
  test.skip(true, 'no Korean input source')
}

test('⌘A → ⌘C right after typing Korean copies the whole memo', async ({ page, app }) => {
  await createDesk(page, '복사 데스크')
  await page.evaluate(async () => {
    const api = (window as unknown as { api: any }).api
    const [desk] = await api.workspace.list()
    const cat = await api.category.create({ workspace_id: desk.id, name: '자료' })
    await api.task.create({ category_id: cat.id, title: '복사 메모', note: '첫 줄\n\n끝 문단' })
  })
  await page.keyboard.press('Meta+p')
  await page.keyboard.type('복사 메모')
  await page.keyboard.press('Enter')
  const editor = page.locator('.bn-editor').first()
  await editor.getByText('끝 문단').click()
  await page.keyboard.press('End')

  await composeGa(page, app)
  await app.evaluate(({ clipboard }) => clipboard.writeText('BEFORE'))
  osa(cmd(KEY.a), 'delay 0.3', cmd(KEY.c), 'delay 0.3')
  await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toContain('첫 줄')
  expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toContain('끝 문단가')

  // ⌘V mid-composition pastes too.
  await page.keyboard.press('ArrowRight')
  await app.evaluate(({ clipboard }) => clipboard.writeText('붙여넣은 글'))
  await composeGa(page, app)
  osa(cmd(KEY.v), 'delay 0.3')
  await expect(editor).toContainText('가붙여넣은 글')
})
