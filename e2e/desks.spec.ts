import { test, expect, createDesk, desks } from './app'

const parentOf = async (page: Parameters<typeof desks>[0], name: string): Promise<string | null> => {
  const all = await desks(page)
  const d = all.find((w) => w.name === name)
  return all.find((w) => w.id === d?.parent_id)?.name ?? null
}

test('dragging a desk onto the middle of another nests it', async ({ page }) => {
  await createDesk(page, '회사')
  await createDesk(page, '마케팅')
  const grip = page.locator('[data-desk-grip]').nth(1)
  const target = page.locator('aside nav').getByRole('button', { name: '회사', exact: true })
  await page.locator('aside nav').getByRole('button', { name: '마케팅', exact: true }).hover()
  const from = (await grip.boundingBox())!
  const to = (await target.boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + 10, from.y - 4, { steps: 4 }) // past the 5px activation distance
  await page.mouse.move(from.x + from.width / 2, to.y + to.height / 2, { steps: 12 })
  await page.mouse.up()
  await expect.poll(() => parentOf(page, '마케팅')).toBe('회사')
})

test('keyboard: Alt+→ nests, Alt+← un-nests, ⌘/Ctrl+Z undoes', async ({ page }) => {
  await createDesk(page, '본부')
  await createDesk(page, '팀')
  const teamGrip = async () => page.locator(`[data-desk-grip="${(await desks(page)).find((d) => d.name === '팀')!.id}"]`)
  await (await teamGrip()).focus()
  await page.keyboard.press('Alt+ArrowRight')
  await expect.poll(() => parentOf(page, '팀')).toBe('본부')
  await (await teamGrip()).focus()
  await page.keyboard.press('Alt+ArrowLeft')
  await expect.poll(() => parentOf(page, '팀')).toBe(null)
  await page.locator('body').focus()
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
  await expect.poll(() => parentOf(page, '팀')).toBe('본부')
  await expect(page.getByText('실행 취소: 데스크 이동')).toBeVisible()
})

test('style picker offers the expanded palette and icon sets', async ({ page }) => {
  await createDesk(page, '디자인')
  await page.getByTitle('색상·아이콘 변경').first().click()
  await expect(page.getByRole('group', { name: '선명' })).toBeVisible()
  await expect(page.locator('[role="group"] button')).toHaveCount(48)
  await page.getByRole('button', { name: '선명 #dc2626' }).click()
  await page.getByRole('tab', { name: '개발' }).click()
  await page.getByRole('tabpanel').getByRole('button', { name: '🚀' }).click()
  await expect.poll(async () => (await desks(page)).find((d) => d.name === '디자인')).toMatchObject({ color: '#dc2626', icon: '🚀' })
})
