import type { Page } from '@playwright/test'
import { test, expect, createDesk } from './app'

/** How far the jump buttons' scroll area is from its top and bottom, in px. */
const gaps = (page: Page): Promise<{ top: number; bottom: number }> =>
  page.getByRole('group', { name: '스크롤 이동' }).evaluate((group) => {
    const el = group.parentElement!.parentElement!
    return { top: el.scrollTop, bottom: el.scrollHeight - el.clientHeight - el.scrollTop }
  })

async function openMemo(page: Page, title: string, note: string): Promise<void> {
  await createDesk(page, '메모 데스크')
  await page.evaluate(
    async ({ title, note }) => {
      const api = (window as unknown as { api: any }).api
      const [desk] = await api.workspace.list()
      const cat = await api.category.create({ workspace_id: desk.id, name: '자료' })
      await api.task.create({ category_id: cat.id, title, note })
    },
    { title, note }
  )
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+p' : 'Control+p')
  await page.keyboard.type(title)
  await page.keyboard.press('Enter')
  await page.locator('.bn-editor').first().waitFor()
}

for (const where of ['inline', 'page'] as const) {
  test(`a long memo (${where}) gets 맨 위로 / 맨 아래로 buttons that jump to each end`, async ({ page }) => {
    const note = Array.from({ length: 120 }, (_, i) => `문단 ${i + 1}`).join('\n\n')
    await openMemo(page, '긴 메모', note)
    if (where === 'page') {
      await page.getByRole('button', { name: '메모 탭에서 열기' }).click()
      await expect(page.getByPlaceholder('제목 없음')).toBeVisible()
    }
    const top = page.getByRole('button', { name: '맨 위로' })
    const bottom = page.getByRole('button', { name: '맨 아래로' })
    await expect(top).toBeDisabled()

    // trial: actionability only — fails if something (e.g. the floating tools button) covers it.
    // The click itself is dispatched so Playwright's scroll-into-view doesn't nudge the position.
    await bottom.click({ trial: true })
    await bottom.dispatchEvent('click')
    await expect.poll(async () => (await gaps(page)).bottom).toBeLessThan(2)
    await expect(bottom).toBeDisabled()

    await top.click({ trial: true })
    await top.dispatchEvent('click')
    await expect.poll(async () => (await gaps(page)).top).toBe(0)
    await expect(top).toBeDisabled()
  })
}

test('a short memo shows no scroll buttons', async ({ page }) => {
  await openMemo(page, '짧은 메모', '한 줄')
  await expect(page.getByText('한 줄')).toBeVisible()
  await expect(page.getByRole('button', { name: '맨 아래로' })).toHaveCount(0)
})
