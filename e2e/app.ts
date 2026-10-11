import { _electron as electron, test as base, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/** The built app, launched against a throwaway data folder. */
export const test = base.extend<{ app: ElectronApplication; page: Page }>({
  app: async ({}, use) => {
    const app = await electron.launch({
      args: ['.'],
      cwd: join(__dirname, '..'),
      env: { ...process.env, AOP_NOTE_USER_DATA: mkdtempSync(join(tmpdir(), 'aop-e2e-')) }
    })
    await use(app)
    await app.close()
  },
  page: async ({ app }, use) => {
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await use(page)
  }
})

export { expect } from '@playwright/test'

export async function createDesk(page: Page, name: string): Promise<void> {
  const empty = page.getByPlaceholder('예: 마케팅, 신규 프로젝트')
  if (await empty.isVisible().catch(() => false)) {
    await empty.fill(name)
    await empty.press('Enter')
  } else {
    await page.locator('aside').getByText('새 데스크', { exact: true }).click()
    const input = page.getByPlaceholder('데스크 이름')
    await input.fill(name)
    await input.press('Enter')
  }
  await page.locator('aside nav').getByRole('button', { name, exact: true }).waitFor()
}

type DeskRow = { id: string; name: string; parent_id: string | null; color: string; icon: string }
export const desks = (page: Page): Promise<DeskRow[]> =>
  page.evaluate(() => (window as unknown as { api: { workspace: { list(): Promise<DeskRow[]> } } }).api.workspace.list())
