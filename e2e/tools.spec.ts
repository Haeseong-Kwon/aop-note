import { test, expect, createDesk, desks } from './app'

const SHOTS = process.env.AOP_E2E_SHOTS // set to a folder to save screenshots for review

test('unified calendar shows schedules from every desk and filters by desk', async ({ page }) => {
  await createDesk(page, '회사')
  await createDesk(page, '개인')
  const [a, b] = await desks(page)
  const today = new Date()
  const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  await page.evaluate(
    ([a, b, day]) => {
      const api = (window as unknown as { api: { schedule: { create(i: object): Promise<unknown> } } }).api
      return Promise.all([
        api.schedule.create({ title: '분기 보고', workspace_id: a, all_day: true, start: day, end: day }),
        api.schedule.create({ title: '병원 예약', workspace_id: b, all_day: true, start: day, end: day })
      ])
    },
    [a.id, b.id, day]
  )

  await page.locator('aside nav').getByRole('button', { name: '통합 달력' }).click()
  const main = page.locator('main')
  await expect(main.getByText('분기 보고')).toBeVisible()
  await expect(main.getByText('병원 예약')).toBeVisible()
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/unified-calendar.png` })

  await main.getByRole('group', { name: '데스크 필터' }).getByRole('button', { name: '개인' }).click()
  await expect(main.getByText('병원 예약')).toBeHidden()
  await expect(main.getByText('분기 보고')).toBeVisible()
})

test('tools: calculator evaluates and VAT splits a total', async ({ page }) => {
  await createDesk(page, '회사')
  await page.locator('aside nav').getByRole('button', { name: '도구' }).click()
  const main = page.locator('main')
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/tools-gallery.png` })

  const rail = main.getByRole('navigation', { name: '도구 목록' })
  await main.getByRole('button', { name: /^계산기 / }).click() // gallery tile
  await main.getByLabel('수식').fill('(1,200 + 300) × 2')
  await main.getByLabel('수식').press('Enter')
  await expect(main.getByLabel('수식')).toHaveValue('3000')

  // Fields start empty (no sample values); typing groups digits and the readout follows.
  await rail.getByRole('button', { name: '부가세', exact: true }).click()
  const amount = main.getByLabel('합계금액 (부가세 포함)')
  await expect(amount).toHaveValue('')
  await expect(main.getByText('값을 입력하면 바로 계산합니다')).toBeVisible()
  await amount.pressSequentially('110000')
  await expect(amount).toHaveValue('110,000')
  await expect(main.locator('output').first()).toContainText('100,000')

  // 초기화 clears the saved inputs.
  await main.getByRole('button', { name: '초기화' }).click()
  await expect(main.getByLabel('합계금액 (부가세 포함)')).toHaveValue('')
})

test('tools: new tools compute (withholding, amount in words, leave)', async ({ page }) => {
  await createDesk(page, '회사')
  await page.locator('aside nav').getByRole('button', { name: '도구' }).click()
  const main = page.locator('main')
  const rail = main.getByRole('navigation', { name: '도구 목록' })

  await rail.getByRole('button', { name: '원천징수 3.3%', exact: true }).click()
  await main.getByLabel('지급액 (세전)').fill('1000000')
  await expect(main.locator('output').first()).toContainText('967,000')

  await rail.getByRole('button', { name: '금액 한글 표기', exact: true }).click()
  await main.getByLabel('금액').fill('12345000')
  await expect(main.getByText('일금 일천이백삼십사만오천원정 (₩12,345,000)')).toBeVisible()

  await rail.getByRole('button', { name: '연차 일수', exact: true }).click()
  await main.getByLabel('입사일').fill('2020-03-02')
  await main.getByLabel('기준일 (비우면 오늘)').fill('2026-03-02')
  await expect(main.locator('output').first()).toContainText('17') // 6 years → 15 + 2

  const tools = ['견적 합계', '주간 근무시간', '광고 성과', '퍼널 전환율', '목록 정리', '비밀번호 생성', '대출 상환', 'RICE 우선순위', '의사결정 매트릭스', '집중 타이머']
  for (const name of tools) {
    await rail.getByRole('button', { name, exact: true }).click()
    await expect(main.getByRole('heading', { name })).toBeVisible()
    if (SHOTS) {
      await page.mouse.move(0, 0)
      await page.waitForTimeout(400) // let the view-in animation settle
      await page.screenshot({ path: `${SHOTS}/tool-${name.replace(/[^\w가-힣]/g, '')}.png` })
    }
  }
})

test('tools: filled readouts (screenshots, light and dark)', async ({ page }) => {
  test.skip(!SHOTS, 'visual review only')
  await createDesk(page, '회사')
  await page.locator('aside nav').getByRole('button', { name: '도구' }).click()
  const main = page.locator('main')
  const rail = main.getByRole('navigation', { name: '도구 목록' })
  await rail.getByRole('button', { name: '광고 성과', exact: true }).click()
  for (const [label, v] of [['광고비', '1000000'], ['노출 수', '200000'], ['클릭 수', '3000'], ['전환 수', '90'], ['전환 매출', '4500000']]) await main.getByLabel(label).fill(v)
  await page.mouse.move(0, 0)
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${SHOTS}/filled-ad.png` })
  await rail.getByRole('button', { name: '퍼널 전환율', exact: true }).click()
  const counts = main.getByLabel('인원')
  for (const [i, v] of ['12000', '1800', '240'].entries()) await counts.nth(i).fill(v)
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${SHOTS}/filled-funnel.png` })
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${SHOTS}/dark-funnel.png` })
  await main.getByRole('button', { name: '모든 도구' }).click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${SHOTS}/dark-gallery.png` })
})

test('floating tools button: list opens from it and runs a tool in a panel', async ({ page }) => {
  await createDesk(page, '회사')
  const fab = page.getByRole('button', { name: '도구 열기' })
  await expect(fab).toBeVisible()
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/fab-idle.png` })

  await fab.click()
  const menu = page.getByRole('menu', { name: '도구' })
  await expect(menu).toBeVisible()
  if (SHOTS) {
    await page.waitForTimeout(250)
    await page.screenshot({ path: `${SHOTS}/fab-menu.png` })
  }
  await menu.getByLabel('도구 찾기').fill('부가')
  await menu.getByLabel('도구 찾기').press('Enter')
  await expect(menu).toBeHidden()

  const panel = page.getByRole('dialog', { name: '부가세' })
  await expect(panel).toBeVisible()
  await panel.getByLabel('합계금액 (부가세 포함)').fill('110000')
  await expect(panel.locator('output').first()).toContainText('100,000')
  if (SHOTS) {
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${SHOTS}/fab-panel.png` })
  }

  await panel.getByRole('button', { name: '넓게 보기' }).click()
  if (SHOTS) {
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${SHOTS}/fab-panel-wide.png` })
  }

  // Open the same tool full-size: the floating button steps aside on the 도구 page.
  await panel.getByRole('button', { name: '도구 화면에서 열기' }).click()
  await expect(page.locator('main').getByRole('heading', { name: '부가세' })).toBeVisible()
  await expect(page.locator('main').getByLabel('합계금액 (부가세 포함)')).toHaveValue('110,000')
  await expect(fab).toBeHidden()
})

