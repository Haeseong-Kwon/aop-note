import { test, expect, createDesk } from './app'

test('palette finds a memo by a word in its body (full-text index)', async ({ page }) => {
  await createDesk(page, '검색 데스크')
  await page.evaluate(async () => {
    const api = (window as unknown as { api: any }).api
    const [desk] = await api.workspace.list()
    const cat = await api.category.create({ workspace_id: desk.id, name: '자료' })
    await api.task.create({ category_id: cat.id, title: '분기 회고', note: '온보딩 퍼널 이탈률이 높아 인터뷰를 잡기로 함' })
  })
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+p' : 'Control+p')
  await page.keyboard.type('이탈률')
  await expect(page.getByText('분기 회고')).toBeVisible()
})
