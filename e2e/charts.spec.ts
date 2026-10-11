import { existsSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { test, expect, createDesk, desks } from './app'
import type { ElectronApplication, Page } from '@playwright/test'

const SHOTS = process.env.AOP_E2E_SHOTS // set to a folder to save screenshots for review

type TaskRow = { id: string; title: string; note: string; note_doc: string | null }
const tasks = async (page: Page): Promise<TaskRow[]> => {
  const [desk] = await desks(page)
  return page.evaluate((id) => (window as unknown as { api: { task: { listByWorkspace(id: string): Promise<TaskRow[]> } } }).api.task.listByWorkspace(id), desk.id)
}

/** The next save dialog answers with `file` instead of asking. */
const answerSaveDialog = (app: ElectronApplication, file: string): Promise<void> =>
  app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: path })) as typeof dialog.showSaveDialog
  }, file)

const shot = async (page: Page, name: string): Promise<void> => {
  if (!SHOTS) return
  await page.mouse.move(0, 0)
  await page.waitForTimeout(350)
  await page.screenshot({ path: `${SHOTS}/${name}.png` })
}

test('통계·그래프: tool draws a chart, pastes from Excel, saves as a live memo block', async ({ page, app }) => {
  await createDesk(page, '회사')
  await page.locator('aside nav').getByRole('button', { name: '도구' }).click()
  const main = page.locator('main')
  await expect(main.locator('#tools-stats')).toBeVisible()
  await shot(page, 'charts-gallery')

  const rail = main.getByRole('navigation', { name: '도구 목록' })
  await rail.getByRole('button', { name: '막대 그래프', exact: true }).click()
  // Starts empty, with a hint instead of a chart.
  await expect(main.getByText('항목 이름과 값을 입력하세요')).toBeVisible()

  // A range copied from Excel (tabs + newlines) fills the grid from the focused cell.
  const firstCell = main.getByLabel('1행 1열')
  await firstCell.evaluate((el) => {
    const data = new DataTransfer()
    data.setData('text/plain', '1월\t120\n2월\t180\n3월\t150\n')
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  })
  await expect(main.getByLabel('2행 2열')).toHaveValue('180')
  await expect(main.locator('.chart-svg svg')).toBeVisible()
  await expect(main.getByText(/가장 큰 항목은 ‘2월’ 180/)).toBeVisible()

  // Every kind renders its sample.
  for (const name of ['선 그래프', '원형·도넛 그래프', '산점도·회귀선', '히스토그램', '상자 수염 그림', '파레토 차트', '폭포 차트', '레이더 차트', '히트맵', '목표 대비 실적', '트리맵', '전후 비교', '기술통계 요약', '상관 행렬', '두 집단 평균 비교 (t-검정)', '분산분석 (ANOVA)', 'A/B 테스트 유의성', '카이제곱 독립성 검정', '추세·예측', '표본 크기 계산', '정규분포 확률']) {
    await rail.getByRole('button', { name, exact: true }).click()
    await main.getByRole('button', { name: '예시 데이터' }).click()
    await expect(main.locator('.chart-svg svg'), name).toBeVisible()
    await expect(main.locator('.chart-insight'), name).not.toBeEmpty()
    await shot(page, `chart-${name.replace(/[^\w가-힣]/g, '')}`)
  }

  // Export straight from the tool: PDF and PPTX land on disk.
  const pdf = join(tmpdir(), `aop-chart-${Date.now()}.pdf`)
  await answerSaveDialog(app, pdf)
  await main.getByRole('button', { name: 'PDF', exact: true }).click()
  await expect.poll(() => existsSync(pdf) && statSync(pdf).size).toBeGreaterThan(5_000)
  expect(readFileSync(pdf).subarray(0, 4).toString()).toBe('%PDF')
  const pptx = join(tmpdir(), `aop-chart-${Date.now()}.pptx`)
  await answerSaveDialog(app, pptx)
  await main.getByRole('button', { name: 'PPTX', exact: true }).click()
  await expect.poll(() => existsSync(pptx) && statSync(pptx).size).toBeGreaterThan(20_000) // includes the chart PNG

  // Save as a memo: a chart block that keeps its data, opened right away.
  await main.getByRole('button', { name: '메모로 저장' }).click()
  const block = page.locator('.bn-chart')
  await expect(block.locator('.chart-svg svg')).toBeVisible()
  const saved = (await tasks(page)).find((t) => t.title === '시험 점수 상위 비율')
  expect(saved?.note).toContain('```aop-chart')
  expect(saved?.note_doc).toContain('"type":"chart"')
  await shot(page, 'chart-memo')

  // Edit inside the memo: the change is saved with the memo (Markdown copy included).
  await block.hover()
  await block.getByRole('button', { name: '데이터 편집' }).click()
  await block.getByLabel('평균', { exact: true }).fill('75')
  await expect.poll(async () => (await tasks(page)).find((t) => t.title === '시험 점수 상위 비율')?.note ?? '', { timeout: 8_000 }).toContain('"mean":"75"')
  await shot(page, 'chart-memo-editing')
  await block.getByRole('button', { name: '편집 완료' }).click()

  // The memo exports to PowerPoint with the chart in it.
  const memoDeck = join(tmpdir(), `aop-memo-${Date.now()}.pptx`)
  await answerSaveDialog(app, memoDeck)
  await page.getByTitle('내보내기').first().click()
  await page.getByRole('button', { name: 'PowerPoint (.pptx)' }).click()
  await expect.poll(() => existsSync(memoDeck) && statSync(memoDeck).size).toBeGreaterThan(20_000)
})

test('통계·그래프: "/" menu inserts a chart block that opens in its editor', async ({ page }) => {
  await createDesk(page, '회사')
  await page.locator('aside nav').getByRole('button', { name: '도구' }).click()
  const main = page.locator('main')
  await main.getByRole('navigation', { name: '도구 목록' }).getByRole('button', { name: '파레토 차트', exact: true }).click()
  await main.getByRole('button', { name: '예시 데이터' }).click()
  await main.getByRole('button', { name: '메모로 저장' }).click()
  await expect(page.locator('.bn-chart .chart-svg svg')).toBeVisible()

  const editor = page.locator('.bn-editor').first()
  await editor.locator('p').last().click()
  await page.keyboard.type('/히스토그램')
  await expect(page.getByText('값이 어디에 몰려 있는지', { exact: false })).toBeVisible()
  await page.keyboard.press('Enter')
  const charts = page.locator('.bn-chart')
  await expect(charts).toHaveCount(2)
  await expect(charts.nth(1).getByText('값을 다섯 개 이상 입력하세요')).toBeVisible() // empty → editor open
  await charts.nth(1).getByRole('button', { name: '예시 데이터' }).click()
  await expect(charts.nth(1).locator('.chart-svg svg').first()).toBeVisible()
  await shot(page, 'chart-slash')
  await expect.poll(async () => ((await tasks(page))[0]?.note.match(/```aop-chart/g) ?? []).length, { timeout: 8_000 }).toBe(2)
})
