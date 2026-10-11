import * as S from './stats'
import * as V from './svg'
import { ALPHA, UNIT, alpha, fmtP, items, labeled, none, num, pText, pct, samples, signed, strength, unit, verdict, type KindDef } from './doc'
import { boxStats } from './graphKinds'

// --- Statistics ------------------------------------------------------------------------

const DESCRIBE_ROWS: [string, (xs: number[]) => string][] = [
  ['개수', (xs) => `${xs.length}`],
  ['평균', (xs) => V.fmt(S.mean(xs), 3)],
  ['표준편차', (xs) => V.fmt(S.sd(xs), 3)],
  ['최솟값', (xs) => V.fmt(Math.min(...xs), 3)],
  ['1사분위 Q1', (xs) => V.fmt(S.quantile(xs, 0.25), 3)],
  ['중앙값', (xs) => V.fmt(S.median(xs), 3)],
  ['3사분위 Q3', (xs) => V.fmt(S.quantile(xs, 0.75), 3)],
  ['최댓값', (xs) => V.fmt(Math.max(...xs), 3)],
  ['범위', (xs) => V.fmt(Math.max(...xs) - Math.min(...xs), 3)],
  ['변동계수 CV', (xs) => pct(S.sd(xs) / Math.abs(S.mean(xs)))],
  ['왜도', (xs) => V.fmt(S.skewness(xs), 3)],
  ['첨도', (xs) => V.fmt(S.kurtosis(xs), 3)],
  ['최빈값', (xs) => S.modes(xs).slice(0, 3).map((x) => V.fmt(x)).join(', ') || '없음'],
  ['평균의 95% 신뢰구간', (xs) => (xs.length < 2 ? '—' : `${V.fmt(S.mean(xs) - S.meanCiHalf(xs), 2)} ~ ${V.fmt(S.mean(xs) + S.meanCiHalf(xs), 2)}`)],
  ['이상치 (1.5 IQR)', (xs) => S.fiveNumber(xs).outliers.map((x) => V.fmt(x)).join(', ') || '없음']
]

export const describe: KindDef = {
  kind: 'describe',
  section: 'stats',
  name: '기술통계 요약',
  blurb: '평균, 표준편차, 사분위수, 이상치를 한 번에',
  grid: { head: ['데이터 1'], rows: 12, labelCol: false, growCols: true, growRows: true, maxCols: 8, hint: '열마다 한 변수 — 엑셀 범위를 그대로 붙여 넣으세요' },
  options: [],
  sample: { title: '주간 판매량 요약', grid: [['A 매장', 'B 매장'], ['132', '98'], ['118', '105'], ['141', '112'], ['127', '87'], ['155', '120'], ['122', '95'], ['138', '101'], ['210', '108'], ['129', '92'], ['134', '117']] },
  compute(doc, th) {
    const cols = samples(doc).filter((c) => c.values.length >= 2)
    if (!cols.length) return none('값을 두 개 이상 입력하세요')
    const c0 = cols[0]
    const m = S.mean(c0.values)
    const s = S.sd(c0.values)
    const out = S.fiveNumber(c0.values).outliers
    const svg =
      cols.length === 1 && c0.values.length >= 5
        ? V.histogramChart(S.histogram(c0.values), th, { xName: c0.name, curve: s > 0 ? (x) => S.normPdf(x, m, s) * c0.values.length * (S.histogram(c0.values)[0].hi - S.histogram(c0.values)[0].lo) : undefined })
        : V.boxChart(cols.filter((c) => c.values.length >= 3).map(boxStats), th)
    return {
      svg: cols.some((c) => c.values.length >= 3) ? svg : '',
      stats: [
        { label: `${cols.length > 1 ? `${c0.name} ` : ''}평균 ± 표준편차`, value: `${V.fmt(m)} ± ${V.fmt(s)}`, strong: true },
        { label: '중앙값', value: V.fmt(S.median(c0.values)) },
        { label: '표본 수', value: `${c0.values.length}개` }
      ],
      table: { head: ['통계량', ...cols.map((c) => c.name)], rows: DESCRIBE_ROWS.map(([label, f]) => [label, ...cols.map((c) => f(c.values))]) },
      insight: `${cols.length > 1 ? `‘${c0.name}’의 ` : ''}평균은 ${V.fmt(m)}, 중앙값은 ${V.fmt(S.median(c0.values))}입니다. ${Math.abs(m - S.median(c0.values)) > s * 0.25 ? '평균과 중앙값 차이가 커서 치우친 분포이므로 중앙값을 대표값으로 쓰는 편이 안전합니다.' : '평균과 중앙값이 가까워 평균을 대표값으로 써도 무리가 없습니다.'}${out.length ? ` 이상치 ${out.length}개(${out.slice(0, 3).map((x) => V.fmt(x)).join(', ')})를 확인해 보세요.` : ''}`
    }
  }
}

export /** Table-sized reading of r: '강함 (+)'. */
const strengthShort = (r: number): string => {
  const a = Math.abs(r)
  return a < 0.1 ? '거의 없음' : `${a < 0.3 ? '약함' : a < 0.5 ? '중간' : a < 0.7 ? '강함' : '매우 강함'} (${r > 0 ? '+' : '−'})`
}

export const corr: KindDef = {
  kind: 'corr',
  section: 'stats',
  name: '상관 행렬',
  blurb: '여러 변수 사이의 상관계수와 유의성',
  grid: { head: ['변수 1', '변수 2', '변수 3'], rows: 10, labelCol: false, growCols: true, growRows: true, maxCols: 10, hint: '열마다 한 변수, 같은 행은 같은 관측' },
  options: [{ key: 'method', label: '방법', default: 'pearson', choices: [['pearson', '피어슨'], ['spearman', '스피어먼']] }],
  sample: { title: '마케팅 지표 상관관계', grid: [['광고비', '방문자', '전환수', '이탈률'], ['120', '5200', '130', '48'], ['150', '5600', '118', '51'], ['90', '4900', '125', '46'], ['200', '7100', '170', '47'], ['170', '6000', '142', '44'], ['230', '7400', '160', '49'], ['110', '5800', '150', '45'], ['260', '8100', '175', '43']] },
  compute(doc, th) {
    const head = doc.grid[0] ?? []
    const rows = doc.grid.slice(1)
    const vars = head.map((h, j) => ({ name: h.trim() || `변수 ${j + 1}`, values: rows.map((r) => S.parseNum(r[j])) })).filter((v) => S.finite(v.values).length >= 3)
    if (vars.length < 2) return none('변수 두 개 이상, 각각 값 세 개 이상을 입력하세요')
    const f = doc.opts.method === 'spearman' ? S.spearman : S.pearson
    const m = vars.map((a) => vars.map((b) => {
      const [x, y] = S.pairs(a.values, b.values)
      return x.length >= 3 ? f(x, y) : NaN
    }))
    const pairsList: { a: string; b: string; r: number; p: number; n: number }[] = []
    vars.forEach((a, i) => vars.forEach((b, j) => {
      if (j <= i) return
      const n = S.pairs(a.values, b.values)[0].length
      pairsList.push({ a: a.name, b: b.name, r: m[i][j], p: S.corrP(m[i][j], n), n })
    }))
    const ranked = pairsList.filter((p) => Number.isFinite(p.r)).sort((x, y) => Math.abs(y.r) - Math.abs(x.r))
    const top = ranked[0]
    return {
      svg: V.heatmapChart(vars.map((v) => v.name), vars.map((v) => v.name), m, th, { diverging: true, digits: 2 }),
      stats: top ? [{ label: '가장 강한 관계', value: `${top.a} ↔ ${top.b} · r = ${V.fmt(top.r, 3)}`, strong: true }, { label: '유의한 쌍 (p < 0.05)', value: `${ranked.filter((p) => p.p < 0.05).length} / ${ranked.length}쌍` }] : [],
      table: { head: ['변수 쌍', 'r', 'p', 'n', '해석'], rows: ranked.map((p) => [`${p.a} ↔ ${p.b}`, V.fmt(p.r, 3), fmtP(p.p), `${p.n}`, strengthShort(p.r)]) },
      insight: top ? `‘${top.a}’와 ‘${top.b}’ 사이에 ${strength(top.r)}(r = ${V.fmt(top.r, 3)}, ${pText(top.p)}). 상관은 인과를 뜻하지 않습니다.` : ''
    }
  }
}

export const ttest: KindDef = {
  kind: 'ttest',
  section: 'stats',
  name: '두 집단 평균 비교 (t-검정)',
  blurb: '두 그룹 평균 차이가 우연인지 판정',
  grid: { head: ['A 집단', 'B 집단'], rows: 10, labelCol: false, growCols: false, growRows: true, hint: '두 열에 각 집단의 값을 입력하세요. 대응 표본은 같은 행이 같은 대상' },
  options: [{ key: 'paired', label: '표본', default: 'off', choices: [['off', '독립 (Welch)'], ['on', '대응 (전후)']] }, ALPHA],
  sample: { title: '새 온보딩 전후 만족도', grid: [['기존 방식', '새 방식'], ['72', '81'], ['68', '79'], ['75', '77'], ['70', '85'], ['66', '74'], ['74', '83'], ['69', '78'], ['71', '80']] },
  compute(doc, th) {
    const head = doc.grid[0] ?? []
    const rows = doc.grid.slice(1)
    const na = head[0]?.trim() || 'A 집단'
    const nb = head[1]?.trim() || 'B 집단'
    const a0 = rows.map((r) => S.parseNum(r[0]))
    const b0 = rows.map((r) => S.parseNum(r[1]))
    const a = S.finite(a0)
    const b = S.finite(b0)
    const al = alpha(doc)
    if (a.length < 2 || b.length < 2) return none('두 집단에 각각 값을 두 개 이상 입력하세요')
    let t: number
    let df: number
    let p: number
    let diff: number
    let ciLo: number
    let ciHi: number
    let d: number
    if (doc.opts.paired === 'on') {
      const [x, y] = S.pairs(a0, b0)
      const dd = x.map((v, i) => y[i] - v)
      if (dd.length < 2 || S.sd(dd) === 0) return none('대응 표본은 같은 행에 짝지은 값이 두 쌍 이상 필요합니다')
      diff = S.mean(dd)
      const se = S.sd(dd) / Math.sqrt(dd.length)
      df = dd.length - 1
      t = diff / se
      p = S.tTwoTail(t, df)
      const crit = S.tInv(1 - al / 2, df)
      ciLo = diff - crit * se
      ciHi = diff + crit * se
      d = diff / S.sd(dd)
    } else {
      if (S.variance(a) + S.variance(b) === 0) return none('두 집단 모두 값이 하나로 같아 비교할 수 없습니다')
      const w = S.welch(b, a, 1 - al)
      ;({ t, df, p, diff, ciLo, ciHi, d } = w)
    }
    const effect = Math.abs(d) < 0.2 ? '매우 작음' : Math.abs(d) < 0.5 ? '작음' : Math.abs(d) < 0.8 ? '중간' : '큼'
    const conf = `${V.fmt((1 - al) * 100, 0)}%`
    return {
      svg: V.intervalChart([na, nb].map((name, i) => {
        const xs = i ? b : a
        const h = S.meanCiHalf(xs, 1 - al)
        return { name, value: S.mean(xs), lo: S.mean(xs) - h, hi: S.mean(xs) + h }
      }), th),
      stats: [
        { label: '결론', value: p < al ? '유의한 차이 있음' : '유의한 차이 없음', strong: true },
        { label: `평균 (${na} / ${nb})`, value: `${V.fmt(S.mean(a))} / ${V.fmt(S.mean(b))}` },
        { label: `차이 (${nb} − ${na})`, value: `${signed(diff)} (${conf} 구간 ${V.fmt(ciLo)} ~ ${V.fmt(ciHi)})` },
        { label: 't (자유도)', value: `${V.fmt(t, 3)} (${V.fmt(df, 1)})` },
        { label: '유의확률 p', value: fmtP(p) },
        { label: "효과 크기 Cohen's d", value: `${V.fmt(Math.abs(d), 2)} · ${effect}` }
      ],
      insight: `${verdict(p, al, `‘${nb}’의 평균이 ‘${na}’보다 ${signed(diff)} ${diff >= 0 ? '높으며' : '낮으며'}, 이 차이는 우연으로 보기 어렵습니다`, '관찰된 차이는 우연으로도 충분히 생길 수 있는 수준입니다')}. 그래프는 각 집단 평균의 ${conf} 신뢰구간입니다.`
    }
  }
}

export const anova: KindDef = {
  kind: 'anova',
  section: 'stats',
  name: '분산분석 (ANOVA)',
  blurb: '세 그룹 이상의 평균 차이 검정',
  grid: { head: ['그룹 1', '그룹 2', '그룹 3'], rows: 8, labelCol: false, growCols: true, growRows: true, maxCols: 10, hint: '열마다 한 그룹의 값을 입력하세요' },
  options: [ALPHA],
  sample: { title: '광고 소재별 클릭률(%)', grid: [['소재 A', '소재 B', '소재 C'], ['2.1', '2.8', '1.9'], ['2.4', '3.1', '2.0'], ['1.9', '2.6', '2.2'], ['2.2', '3.3', '1.7'], ['2.0', '2.9', '2.1'], ['2.5', '3.0', '1.8']] },
  compute(doc, th) {
    const groups = samples(doc).filter((g) => g.values.length >= 2)
    if (groups.length < 2) return none('두 그룹 이상, 각각 값을 두 개 이상 입력하세요')
    const al = alpha(doc)
    const r = S.anova(groups.map((g) => g.values))
    if (!Number.isFinite(r.f)) return none('그룹 안의 값이 모두 같아 검정할 수 없습니다')
    const best = groups.reduce((x, y) => (S.mean(y.values) > S.mean(x.values) ? y : x))
    return {
      svg: V.intervalChart(groups.map((g) => {
        const h = S.meanCiHalf(g.values, 1 - al)
        return { name: g.name, value: S.mean(g.values), lo: S.mean(g.values) - h, hi: S.mean(g.values) + h }
      }), th),
      stats: [
        { label: '결론', value: r.p < al ? '그룹 간 평균 차이 있음' : '유의한 차이 없음', strong: true },
        { label: 'F (자유도)', value: `${V.fmt(r.f, 3)} (${r.df1}, ${r.df2})` },
        { label: '유의확률 p', value: fmtP(r.p) },
        { label: '효과 크기 η²', value: `${V.fmt(r.eta2, 3)} (${pct(r.eta2, 0)}를 그룹이 설명)` },
        { label: '평균이 가장 높은 그룹', value: `${best.name} · ${V.fmt(S.mean(best.values))}` }
      ],
      table: { head: ['그룹', 'n', '평균', '표준편차'], rows: groups.map((g) => [g.name, `${g.values.length}`, V.fmt(S.mean(g.values), 3), V.fmt(S.sd(g.values), 3)]) },
      insight: `${verdict(r.p, al, '적어도 한 그룹의 평균이 다릅니다', '그룹 간 평균 차이가 우연 수준입니다')}.${r.p < al ? ` 평균은 ‘${best.name}’이 가장 높습니다. 어느 쌍이 다른지는 t-검정으로 확인하세요.` : ''}`
    }
  }
}

export const abtest: KindDef = {
  kind: 'abtest',
  section: 'stats',
  name: 'A/B 테스트 유의성',
  blurb: '전환율 차이, 상승률, 필요한 표본 수',
  grid: { head: ['', '방문자', '전환'], rows: 2, labelCol: true, growCols: false, growRows: false, rowLabels: ['A (기존)', 'B (변경)'], hint: '각 안의 방문자 수와 전환 수를 입력하세요' },
  options: [ALPHA],
  sample: { title: '결제 버튼 문구 A/B 테스트', grid: [['', '방문자', '전환'], ['A (기존)', '4820', '231'], ['B (변경)', '4790', '289']] },
  compute(doc, th) {
    const rows = doc.grid.slice(1)
    const [nA, xA] = [S.parseNum(rows[0]?.[1]), S.parseNum(rows[0]?.[2])]
    const [nB, xB] = [S.parseNum(rows[1]?.[1]), S.parseNum(rows[1]?.[2])]
    if (![nA, xA, nB, xB].every(Number.isFinite) || nA <= 0 || nB <= 0) return none('A와 B의 방문자 수와 전환 수를 입력하세요')
    if (xA > nA || xB > nB || xA < 0 || xB < 0) return none('전환 수는 0 이상, 방문자 수 이하여야 합니다')
    if (xA + xB === 0 || xA + xB === nA + nB) return none('전환이 모두 0이거나 모두 전환이면 비교할 수 없습니다')
    const al = alpha(doc)
    const r = S.twoProportion(nA, xA, nB, xB, 1 - al)
    const nameA = rows[0]?.[0]?.trim() || 'A'
    const nameB = rows[1]?.[0]?.trim() || 'B'
    const za = S.normInv(1 - al / 2)
    const zb = S.normInv(0.8)
    const need = r.pB === r.pA ? NaN : Math.ceil(((za + zb) ** 2 * (r.pA * (1 - r.pA) + r.pB * (1 - r.pB))) / (r.pB - r.pA) ** 2)
    const [wa, wb] = [S.wilson(xA, nA, 1 - al), S.wilson(xB, nB, 1 - al)]
    return {
      svg: V.intervalChart([{ name: nameA, value: r.pA * 100, lo: wa[0] * 100, hi: wa[1] * 100 }, { name: nameB, value: r.pB * 100, lo: wb[0] * 100, hi: wb[1] * 100 }], th, { unit: '%' }),
      stats: [
        { label: '결론', value: r.p < al ? `${r.pB > r.pA ? nameB : nameA} 승 (유의함)` : '아직 판단 불가', strong: true },
        { label: '전환율 A / B', value: `${pct(r.pA, 2)} / ${pct(r.pB, 2)}` },
        { label: '상승률 (B vs A)', value: `${signed(r.lift * 100, 1)}%` },
        { label: `차이의 ${V.fmt((1 - al) * 100, 0)}% 신뢰구간`, value: `${signed(r.ciLo * 100, 2)} ~ ${signed(r.ciHi * 100, 2)}%p` },
        { label: 'z / 유의확률 p', value: `${V.fmt(r.z, 2)} / ${fmtP(r.p)}` },
        { label: '이 차이를 검출할 표본 (검정력 80%)', value: Number.isFinite(need) ? `그룹당 ${V.fmt(need, 0)}명` : '—' }
      ],
      insight: r.p < al
        ? `${nameB}의 전환율이 ${nameA}보다 ${signed(r.lift * 100, 1)}% (${signed((r.pB - r.pA) * 100, 2)}%p) ${r.pB > r.pA ? '높고' : '낮고'}, 이 차이는 통계적으로 유의합니다(${pText(r.p)}).`
        : `차이(${signed(r.lift * 100, 1)}%)가 아직 우연 범위입니다(${pText(r.p)}).${Number.isFinite(need) && need > Math.min(nA, nB) ? ` 같은 차이라면 그룹당 약 ${V.fmt(need, 0)}명까지 모아 보세요.` : ''}`
    }
  }
}

export const chisq: KindDef = {
  kind: 'chisq',
  section: 'stats',
  name: '카이제곱 독립성 검정',
  blurb: '교차표 — 두 범주가 서로 관련 있는지',
  grid: { head: ['', '열 1', '열 2'], rows: 2, labelCol: true, growCols: true, growRows: true, maxCols: 10, hint: '행·열 범주 이름과 각 칸의 빈도(건수)를 입력하세요' },
  options: [ALPHA],
  sample: { title: '연령대별 선호 요금제', grid: [['', '베이직', '프로', '팀'], ['20대', '86', '42', '12'], ['30대', '64', '71', '35'], ['40대 이상', '38', '55', '48']] },
  compute(doc, th) {
    const { cats, series } = labeled(doc)
    const live = series.filter((s) => s.values.some(Number.isFinite))
    const cell = (v: number): number => (Number.isFinite(v) ? v : 0)
    const used = cats.map((_, i) => i).filter((i) => S.sum(live.map((s) => cell(s.values[i]))) > 0)
    const table = used.map((i) => live.map((s) => cell(s.values[i])))
    const rowNames = used.map((i) => cats[i])
    if (table.length < 2 || live.length < 2) return none('2×2 이상의 빈도표를 입력하세요')
    if (table.some((r) => r.some((v) => v < 0))) return none('빈도는 0 이상이어야 합니다')
    const colSums = live.map((_, j) => S.sum(table.map((r) => r[j])))
    if (colSums.some((c) => c === 0)) return none('모든 열에 빈도가 하나 이상 있어야 합니다')
    const al = alpha(doc)
    const r = S.chiSquare(table)
    const small = r.expected.flat().filter((e) => e < 5).length
    return {
      svg: V.barChart(rowNames, live.map((s, j) => ({ name: s.name, values: table.map((row) => row[j]) })), th, { horizontal: true, mode: 'percent' }),
      stats: [
        { label: '결론', value: r.p < al ? '관련 있음 (독립 아님)' : '관련성 확인 안 됨', strong: true },
        { label: 'χ² (자유도)', value: `${V.fmt(r.chi2, 3)} (${r.df})` },
        { label: '유의확률 p', value: fmtP(r.p) },
        { label: "관련 강도 Cramér's V", value: `${V.fmt(r.cramerV, 3)} · ${r.cramerV < 0.1 ? '매우 약함' : r.cramerV < 0.3 ? '약함' : r.cramerV < 0.5 ? '중간' : '강함'}` },
        ...(small ? [{ label: '주의', value: `기대빈도 5 미만 칸 ${small}개 — 결과 해석 주의` }] : [])
      ],
      insight: `${verdict(r.p, al, '행 범주에 따라 열 범주의 분포가 다릅니다', '두 범주는 서로 독립이라고 봐도 무리가 없습니다')}. 그래프는 행마다 열 범주의 구성비(100%)입니다.`
    }
  }
}

export const forecast: KindDef = {
  kind: 'forecast',
  section: 'stats',
  name: '추세·예측',
  blurb: '이동평균과 선형 추세로 다음 기간 예측',
  grid: { head: ['기간', '값'], rows: 8, labelCol: true, growCols: false, growRows: true, hint: '시간 순서대로 입력하세요 (최소 4개 기간)' },
  options: [
    { key: 'ahead', label: '예측 기간', default: '3', suffix: '기간' },
    { key: 'ma', label: '이동평균', default: '3', suffix: '기간' },
    UNIT
  ],
  sample: { title: '월 매출 추세와 3개월 예측', grid: [['월', '매출'], ['1월', '820'], ['2월', '860'], ['3월', '845'], ['4월', '910'], ['5월', '955'], ['6월', '940'], ['7월', '1010'], ['8월', '1060']], opts: { unit: '만원' } },
  compute(doc, th) {
    const its = items(doc)
    if (its.length < 4) return none('네 기간 이상의 값을 입력하세요')
    const u = unit(doc)
    const ys = its.map((i) => i.value)
    const xs = ys.map((_, i) => i)
    const reg = S.linReg(xs, ys)
    const ahead = Math.max(1, Math.min(24, Math.round(num(doc, 'ahead')) || 3))
    const w = Math.max(2, Math.min(ys.length, Math.round(num(doc, 'ma')) || 3))
    const futureX = Array.from({ length: ahead }, (_, k) => ys.length + k)
    const cats = [...its.map((i) => i.name), ...futureX.map((_, k) => `+${k + 1}`)]
    const pad = (arr: number[], before: number, after: number): number[] => [...Array(before).fill(NaN), ...arr, ...Array(after).fill(NaN)]
    const pred = futureX.map((x) => reg.slope * x + reg.intercept)
    const half = futureX.map((x) => S.predictionHalfWidth(reg, x))
    // The forecast line starts at the last actual point so the two read as one story.
    const fc = [...Array(ys.length - 1).fill(NaN), ys[ys.length - 1], ...pred]
    const band = { lo: [...Array(ys.length - 1).fill(NaN), ys[ys.length - 1], ...pred.map((p, k) => p - half[k])], hi: [...Array(ys.length - 1).fill(NaN), ys[ys.length - 1], ...pred.map((p, k) => p + half[k])] }
    const growth = S.mean(ys.slice(1).map((y, i) => (ys[i] ? (y - ys[i]) / Math.abs(ys[i]) : NaN)).filter(Number.isFinite))
    return {
      svg: V.lineChart(cats, [
        { name: '실제', values: pad(ys, 0, ahead) },
        { name: `${w}기간 이동평균`, values: pad(S.movingAverage(ys, w), 0, ahead), noDots: true },
        { name: '예측 (95% 구간)', values: fc, dash: true, band, color: th.series[2] }
      ], th, { unit: u }),
      stats: [
        { label: `다음 기간 (+1) 예측`, value: `${V.fmt(pred[0])}${u} (± ${V.fmt(half[0])})`, strong: true },
        { label: `+${ahead} 기간 예측`, value: `${V.fmt(pred[ahead - 1])}${u}` },
        { label: '추세 (기간당)', value: `${signed(reg.slope)}${u}` },
        { label: '추세 설명력 R²', value: V.fmt(reg.r2, 3) },
        { label: '평균 성장률 (기간당)', value: Number.isFinite(growth) ? `${signed(growth * 100, 2)}%` : '—' }
      ],
      table: { head: ['기간', '예측', '95% 하한', '95% 상한'], rows: pred.map((p, k) => [`+${k + 1}`, V.fmt(p), V.fmt(p - half[k]), V.fmt(p + half[k])]) },
      insight: `기간당 ${signed(reg.slope)}${u}씩 ${reg.slope >= 0 ? '증가' : '감소'}하는 추세가 이어지면 다음 기간은 약 ${V.fmt(pred[0])}${u}입니다. ${reg.r2 >= 0.7 ? '추세가 뚜렷해 예측의 근거가 비교적 탄탄합니다.' : '변동이 커서 예측 구간이 넓습니다 — 참고용으로 보세요.'}`
    }
  }
}

export const samplesize: KindDef = {
  kind: 'samplesize',
  section: 'stats',
  name: '표본 크기 계산',
  blurb: '설문 응답이 몇 명 필요한지, 오차범위',
  options: [
    { key: 'conf', label: '신뢰수준', default: '0.95', choices: [['0.9', '90%'], ['0.95', '95%'], ['0.99', '99%']] },
    { key: 'moe', label: '허용 오차범위', default: '', suffix: '%p', placeholder: '5' },
    { key: 'p', label: '예상 응답 비율', default: '50', suffix: '%', placeholder: '모르면 50' },
    { key: 'pop', label: '모집단 크기', default: '', suffix: '명', placeholder: '모르면 비워 두기' },
    { key: 'rate', label: '예상 응답률', default: '', suffix: '%', placeholder: '예: 20' }
  ],
  sample: { title: '고객 만족도 설문 표본 설계', grid: [], opts: { conf: '0.95', moe: '5', p: '50', pop: '12000', rate: '25' } },
  compute(doc, th) {
    const conf = Number(doc.opts.conf) || 0.95
    const moe = num(doc, 'moe') / 100
    const p = (Number.isFinite(num(doc, 'p')) ? num(doc, 'p') : 50) / 100
    const pop = num(doc, 'pop')
    const rate = num(doc, 'rate') / 100
    if (!(moe > 0 && moe < 1) || !(p > 0 && p < 1)) return none('오차범위(0~100%)와 예상 비율을 입력하세요')
    const N = pop > 0 ? pop : Infinity
    const n = S.sampleSize(conf, moe, p, N)
    const send = rate > 0 && rate <= 1 ? Math.ceil(n / rate) : NaN
    const x1 = Math.max(n * 3, 200)
    return {
      svg: V.curveChart((x) => S.marginOfError(conf, Math.min(x, Number.isFinite(N) ? N : x), p, N) * 100, Math.max(10, n / 8), x1, th, { xName: '응답자 수 (명)', yName: '오차범위 (±%p)', marks: [{ x: n, label: `${V.fmt(n, 0)}명 → ±${V.fmt(moe * 100, 1)}%p` }] }),
      stats: [
        { label: '필요한 응답 수', value: `${V.fmt(n, 0)}명`, strong: true },
        ...(Number.isFinite(send) ? [{ label: `응답률 ${pct(rate, 0)}일 때 발송`, value: `${V.fmt(send, 0)}명` }] : []),
        { label: '절반만 모이면 오차', value: `±${V.fmt(S.marginOfError(conf, Math.max(2, Math.ceil(n / 2)), p, N) * 100, 2)}%p` },
        { label: '두 배를 모으면 오차', value: `±${V.fmt(S.marginOfError(conf, Number.isFinite(N) ? Math.min(N, n * 2) : n * 2, p, N) * 100, 2)}%p` }
      ],
      insight: `신뢰수준 ${pct(conf, 0)}에서 오차범위 ±${V.fmt(moe * 100, 1)}%p를 지키려면 ${V.fmt(n, 0)}명의 응답이 필요합니다${Number.isFinite(send) ? `(응답률 ${pct(rate, 0)}이면 ${V.fmt(send, 0)}명에게 발송)` : ''}. 오차를 절반으로 줄이려면 표본이 약 4배 필요합니다.`
    }
  }
}

export const normal: KindDef = {
  kind: 'normal',
  section: 'stats',
  name: '정규분포 확률',
  blurb: '평균·표준편차로 구간 확률, Z점수, 백분위',
  options: [
    { key: 'mean', label: '평균', default: '', placeholder: '예: 70' },
    { key: 'sd', label: '표준편차', default: '', placeholder: '예: 10' },
    { key: 'mode', label: '구할 확률', default: 'below', choices: [['below', 'a 이하'], ['above', 'a 이상'], ['between', 'a ~ b']] },
    { key: 'a', label: 'a', default: '', placeholder: '예: 85' },
    { key: 'b', label: 'b (a ~ b일 때)', default: '', placeholder: '예: 90' }
  ],
  sample: { title: '시험 점수 상위 비율', grid: [], opts: { mean: '70', sd: '10', mode: 'above', a: '85', b: '' } },
  compute(doc, th) {
    const mu = num(doc, 'mean')
    const s = num(doc, 'sd')
    const a = num(doc, 'a')
    const mode = doc.opts.mode || 'below'
    const b = num(doc, 'b')
    if (!Number.isFinite(mu) || !(s > 0) || !Number.isFinite(a)) return none('평균, 표준편차(0보다 큼), a 값을 입력하세요')
    if (mode === 'between' && !Number.isFinite(b)) return none('b 값을 입력하세요')
    const [lo, hi] = mode === 'between' ? [Math.min(a, b), Math.max(a, b)] : [a, a]
    const za = (lo - mu) / s
    const zb = (hi - mu) / s
    const prob = mode === 'below' ? S.normCdf(za) : mode === 'above' ? 1 - S.normCdf(za) : S.normCdf(zb) - S.normCdf(za)
    const shade: [number, number] = mode === 'below' ? [mu - 5 * s, a] : mode === 'above' ? [a, mu + 5 * s] : [lo, hi]
    const what = mode === 'below' ? `${V.fmt(a)} 이하` : mode === 'above' ? `${V.fmt(a)} 이상` : `${V.fmt(lo)} ~ ${V.fmt(hi)}`
    return {
      svg: V.curveChart((x) => S.normPdf(x, mu, s), mu - 4 * s, mu + 4 * s, th, { shade, marks: (mode === 'between' ? [lo, hi] : [a]).map((x) => ({ x, label: `${V.fmt(x)} (Z ${V.fmt((x - mu) / s, 2)})` })) }),
      stats: [
        { label: `P(${what})`, value: pct(prob, 2), strong: true },
        { label: mode === 'between' ? 'Z 점수 (a / b)' : 'Z 점수', value: mode === 'between' ? `${V.fmt(za, 3)} / ${V.fmt(zb, 3)}` : V.fmt(za, 3) },
        { label: `${V.fmt(a)}의 백분위`, value: `하위 ${pct(S.normCdf((a - mu) / s), 1)} · 상위 ${pct(1 - S.normCdf((a - mu) / s), 1)}` },
        { label: '평균 ±1σ / ±2σ 구간', value: `${V.fmt(mu - s)}~${V.fmt(mu + s)} / ${V.fmt(mu - 2 * s)}~${V.fmt(mu + 2 * s)}` }
      ],
      insight: `평균 ${V.fmt(mu)}, 표준편차 ${V.fmt(s)}인 정규분포에서 ${what}일 확률은 ${pct(prob, 2)}입니다 — 대략 ${prob > 0 ? `${V.fmt(Math.max(1, Math.round(1 / prob)), 0)}명 중 1명` : '거의 없음'}꼴입니다.`
    }
  }
}

