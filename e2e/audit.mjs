// Design audit: seed realistic data, capture every main screen in light + dark.
// Usage: node e2e/audit.mjs <outDir> [label]
import { _electron as electron } from '@playwright/test'
import { mkdtempSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const out = process.argv[2]
const label = process.argv[3] ?? 'before'
mkdirSync(out, { recursive: true })
const app = await electron.launch({ args: ['.'], cwd: process.cwd(), env: { ...process.env, AOP_NOTE_USER_DATA: mkdtempSync(join(tmpdir(), 'aop-audit-')) } })
const page = await app.firstWindow()
page.setDefaultTimeout(4000)
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
page.on('crash', () => console.log('CRASH'))
page.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text().slice(0, 300)))
await page.setViewportSize({ width: 1440, height: 900 }).catch(() => undefined)
await page.waitForTimeout(800)

await page.evaluate(async () => {
  const api = window.api
  const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10) }
  const iso = (offset, h = 9) => { const d = new Date(); d.setDate(d.getDate() + offset); d.setHours(h, 0, 0, 0); return d.toISOString() }
  const co = await api.workspace.create({ name: '프로덕트 팀', color: '#2563eb', icon: '🚀' })
  const mk = await api.workspace.create({ name: '마케팅', color: '#db2777', icon: '📣', parent_id: co.id })
  await api.workspace.create({ name: '개인', color: '#16a34a', icon: '🌱' })
  await api.workspace.create({ name: '리서치', color: '#7d6b9e', icon: '' })
  const c1 = await api.category.create({ workspace_id: co.id, name: '스프린트 24', color: '#2563eb' })
  const c2 = await api.category.create({ workspace_id: co.id, name: '회의록', color: '#ca8a04' })
  await api.category.create({ workspace_id: co.id, name: '디자인 리뷰', color: '#db2777', parent_id: c1.id })
  const goal = await api.goal.create({ workspace_id: co.id, title: '10월 온보딩 개선 출시', due_date: iso(20), description: '가입 후 7일 잔존율 35% → 45%' })
  await api.goal.create({ workspace_id: co.id, title: '결제 페이지 리뉴얼', due_date: iso(-2) })
  const t = [
    ['온보딩 퍼널 이탈 구간 분석', 3, iso(0), 'doing'], ['신규 가입 이메일 카피 수정', 2, iso(1), 'todo'],
    ['결제 오류 재현 및 로그 수집', 3, iso(-1), 'todo'], ['디자인 시스템 토큰 정리', 1, iso(5), 'todo'],
    ['주간 지표 리포트 공유', 2, null, 'done'], ['고객 인터뷰 5건 일정 잡기', 0, iso(3), 'todo']
  ]
  for (const [title, priority, due, status] of t) {
    const task = await api.task.create({ category_id: c1.id, title, priority, due_date: due, status, goal_id: title.includes('온보딩') ? goal.id : null })
  }
  await api.task.create({ category_id: c2.id, title: '10월 2주차 제품 회의', note: '## 결정\n\n- 온보딩 3단계를 2단계로 줄인다\n- 결제 페이지는 11월로 연기\n\n## 액션 아이템\n\n- [ ] 이탈 구간 대시보드 만들기\n- [x] 인터뷰 대상자 목록 확정\n\n> 다음 회의: [[디자인 시스템 토큰 정리]] 리뷰' })
  await api.task.create({ category_id: c2.id, title: '경쟁사 온보딩 벤치마크', note: '세 곳의 가입 흐름을 비교했다. 단계 수, 소셜 로그인, 첫 화면 가치 제안.' })
  await api.schedule.create({ workspace_id: co.id, title: '스프린트 리뷰', all_day: false, start: iso(2, 14), end: iso(2, 15) })
  await api.schedule.create({ workspace_id: co.id, title: '팀 워크숍', all_day: true, start: day(6), end: day(7), color: '#16a34a' })
  await api.schedule.create({ workspace_id: mk.id, title: '캠페인 런칭', all_day: true, start: day(9), end: day(9), color: '#db2777' })
})
await page.reload()
await page.waitForTimeout(1200)

const shot = async (name) => {
  console.log('shot', name)
  await page.waitForTimeout(450)
  await page.screenshot({ path: join(out, `${label}-${name}.png`) })
}
const clickDesk = (name) => page.locator('aside nav').getByRole('button', { name, exact: true }).click()
const tab = (name) => page.getByRole('button', { name, exact: true }).first().click().catch(() => page.getByText(name, { exact: true }).first().click())

for (const theme of ['라이트', '다크']) {
  await page.getByTitle(theme, { exact: true }).click()
  const t = theme === '라이트' ? 'light' : 'dark'
  await clickDesk('프로덕트 팀')
  await tab('작업'); await shot(`${t}-tasks`)
  await tab('메모'); await shot(`${t}-notes`)
  await page.getByText('10월 2주차 제품 회의').first().click().catch(() => undefined); await shot(`${t}-memo`)
  await tab('달력'); await shot(`${t}-calendar`)
  await tab('목표'); await shot(`${t}-goals`)
  await tab('문서'); await shot(`${t}-documents`)
  await page.locator('aside').getByText('오늘', { exact: true }).click(); await shot(`${t}-today`)
  await page.locator('aside').getByText('그래프', { exact: true }).click(); await page.waitForTimeout(1500); await shot(`${t}-graph`)
  await page.locator('aside').getByText('설정', { exact: true }).click(); await shot(`${t}-settings`)
  await clickDesk('프로덕트 팀')
  await page.keyboard.press('Meta+p'); await page.keyboard.type('온보딩'); await shot(`${t}-palette`); await page.keyboard.press('Escape')
  await page.getByTitle('색상·아이콘 변경').first().click(); await shot(`${t}-picker`); await page.keyboard.press('Escape'); await page.mouse.click(1300, 800)
  await page.keyboard.press('Meta+n'); await shot(`${t}-capture`); await page.keyboard.press('Escape')
}
await app.close()
console.log('done')
