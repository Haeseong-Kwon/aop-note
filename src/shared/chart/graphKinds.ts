import * as S from './stats'
import * as V from './svg'
import { UNIT, filled, fmtP, items, labeled, none, num, pct, samples, signed, strength, unit, type KindDef, type StatLine } from './doc'

// --- Graphs -----------------------------------------------------------------------------

export const bar: KindDef = {
  kind: 'bar',
  section: 'graph',
  name: '막대 그래프',
  blurb: '항목별 크기 비교 — 묶음·누적·100%, 가로/세로',
  grid: { head: ['항목', '값'], rows: 5, labelCol: true, growCols: true, growRows: true, maxCols: 9, hint: '열을 추가하면 여러 계열을 비교합니다' },
  options: [
    { key: 'dir', label: '방향', default: 'v', choices: [['v', '세로'], ['h', '가로']] },
    { key: 'mode', label: '배치', default: 'group', choices: [['group', '묶음'], ['stack', '누적'], ['percent', '100%']] },
    { key: 'labels', label: '값 표시', default: 'on', choices: [['on', '표시'], ['off', '숨김']] },
    UNIT
  ],
  sample: { title: '분기별 매출', grid: [['분기', '국내', '해외'], ['1분기', '1200', '420'], ['2분기', '1350', '510'], ['3분기', '1280', '640'], ['4분기', '1510', '780']], opts: { unit: '만원' } },
  compute(doc, th) {
    const { cats, series } = labeled(doc)
    if (!cats.length || !series.some((s) => s.values.some(Number.isFinite))) return none('항목 이름과 값을 입력하세요')
    const u = unit(doc)
    const totals = cats.map((_, i) => S.sum(series.map((s) => (Number.isFinite(s.values[i]) ? s.values[i] : 0))))
    const grand = S.sum(totals)
    const hi = totals.indexOf(Math.max(...totals))
    const lo = totals.indexOf(Math.min(...totals))
    const stats: StatLine[] = [
      { label: '합계', value: `${V.fmt(grand)}${u}`, strong: true },
      { label: '항목 평균', value: `${V.fmt(grand / cats.length)}${u}` },
      { label: '가장 큼', value: `${cats[hi]} · ${V.fmt(totals[hi])}${u}` },
      { label: '가장 작음', value: `${cats[lo]} · ${V.fmt(totals[lo])}${u}` },
      ...(series.length > 1 ? series.map((s) => ({ label: `${s.name} 합계`, value: `${V.fmt(S.sum(S.finite(s.values)))}${u} (${pct(S.sum(S.finite(s.values)) / grand)})` })) : [])
    ]
    const share = grand ? ` (전체의 ${pct(totals[hi] / grand)})` : ''
    return {
      svg: V.barChart(cats, series, th, { horizontal: doc.opts.dir === 'h', mode: (doc.opts.mode as 'group') || 'group', labels: doc.opts.labels !== 'off' && cats.length * series.length <= 24, unit: u }),
      stats,
      insight: `가장 큰 항목은 ‘${cats[hi]}’ ${V.fmt(totals[hi])}${u}${share}이고, 가장 작은 ‘${cats[lo]}’보다 ${totals[lo] ? `${V.fmt(totals[hi] / totals[lo], 1)}배` : `${V.fmt(totals[hi] - totals[lo])}${u}`} 큽니다.`
    }
  }
}

export const line: KindDef = {
  kind: 'line',
  section: 'graph',
  name: '선 그래프',
  blurb: '시간에 따른 변화와 추세 — 여러 계열, 영역',
  grid: { head: ['기간', '값'], rows: 6, labelCol: true, growCols: true, growRows: true, maxCols: 9, hint: '왼쪽 열에 기간(월, 주, 연도)을 적으세요' },
  options: [
    { key: 'area', label: '영역 채우기', default: 'off', choices: [['off', '선만'], ['on', '영역']] },
    { key: 'zero', label: '세로축', default: 'auto', choices: [['auto', '자동'], ['zero', '0부터']] },
    UNIT
  ],
  sample: { title: '월별 활성 사용자', grid: [['월', '웹', '앱'], ['1월', '3200', '2100'], ['2월', '3350', '2480'], ['3월', '3100', '2950'], ['4월', '3600', '3400'], ['5월', '3900', '3980'], ['6월', '4150', '4620']], opts: { unit: '명' } },
  compute(doc, th) {
    const { cats, series } = labeled(doc)
    const live = series.filter((s) => S.finite(s.values).length >= 2)
    if (cats.length < 2 || !live.length) return none('두 기간 이상의 값을 입력하세요')
    const u = unit(doc)
    const stats: StatLine[] = live.flatMap((s) => {
      const vals = s.values.map((v, i) => [v, i] as const).filter(([v]) => Number.isFinite(v))
      const [first, fi] = vals[0]
      const [last, li] = vals[vals.length - 1]
      const max = vals.reduce((m, x) => (x[0] > m[0] ? x : m))
      const prefix = live.length > 1 ? `${s.name} ` : ''
      return [
        { label: `${prefix}${cats[fi]} → ${cats[li]}`, value: `${V.fmt(first)} → ${V.fmt(last)}${u} (${first ? signed(((last - first) / Math.abs(first)) * 100, 1) + '%' : '—'})`, strong: true },
        { label: `${prefix}최고`, value: `${cats[max[1]]} · ${V.fmt(max[0])}${u}` },
        { label: `${prefix}평균`, value: `${V.fmt(S.mean(vals.map((x) => x[0])))}${u}` }
      ]
    })
    const s0 = live[0]
    const v0 = S.finite(s0.values)
    const change = v0[0] ? (v0[v0.length - 1] - v0[0]) / Math.abs(v0[0]) : NaN
    const reg = S.linReg(s0.values.map((_, i) => i).filter((i) => Number.isFinite(s0.values[i])), v0)
    return {
      svg: V.lineChart(cats, live.map((s) => ({ ...s, area: doc.opts.area === 'on' })), th, { unit: u, zero: doc.opts.zero === 'zero', endLabels: live.length <= 4 }),
      stats,
      insight: `${live.length > 1 ? `‘${s0.name}’은 ` : ''}처음보다 ${Number.isFinite(change) ? `${pct(Math.abs(change))} ${change >= 0 ? '증가' : '감소'}` : '변화'}했으며, 기간당 평균 ${signed(reg.slope, 1)}${u}씩 ${reg.slope >= 0 ? '오르는' : '내리는'} 추세입니다(추세 설명력 R² ${V.fmt(reg.r2, 2)}).`
    }
  }
}

export const pie: KindDef = {
  kind: 'pie',
  section: 'graph',
  name: '원형·도넛 그래프',
  blurb: '전체에서 각 항목이 차지하는 비중',
  grid: { head: ['항목', '값'], rows: 5, labelCol: true, growCols: false, growRows: true, hint: '8개를 넘는 항목은 ‘기타’로 묶습니다' },
  options: [{ key: 'donut', label: '모양', default: 'on', choices: [['on', '도넛'], ['off', '원형']] }, UNIT],
  sample: { title: '비용 구성', grid: [['항목', '금액'], ['인건비', '5400'], ['임차료', '1800'], ['마케팅', '1250'], ['IT·도구', '640'], ['기타', '410']], opts: { unit: '만원' } },
  compute(doc, th) {
    const its = items(doc).filter((i) => i.value > 0)
    if (!its.length) return none('항목과 0보다 큰 값을 입력하세요')
    const u = unit(doc)
    const total = S.sum(its.map((i) => i.value))
    const sortedIts = [...its].sort((a, b) => b.value - a.value)
    const top3 = S.sum(sortedIts.slice(0, 3).map((i) => i.value)) / total
    return {
      svg: V.pieChart(its, th, { donut: doc.opts.donut !== 'off', unit: u }),
      stats: [
        { label: '합계', value: `${V.fmt(total)}${u}`, strong: true },
        { label: '가장 큰 비중', value: `${sortedIts[0].name} · ${pct(sortedIts[0].value / total)}` },
        { label: '항목 수', value: `${its.length}개` },
        ...(its.length > 3 ? [{ label: '상위 3개 비중', value: pct(top3) }] : [])
      ],
      insight: `‘${sortedIts[0].name}’이 전체의 ${pct(sortedIts[0].value / total)}로 가장 크고${its.length > 3 ? `, 상위 3개 항목이 ${pct(top3)}를 차지합니다` : ''}.`
    }
  }
}

export const scatter: KindDef = {
  kind: 'scatter',
  section: 'graph',
  name: '산점도·회귀선',
  blurb: '두 값의 관계, 회귀식과 예측값',
  grid: { head: ['이름', 'X', 'Y'], rows: 8, labelCol: true, growCols: false, growRows: true, hint: '이름은 비워도 됩니다. 머리글에 X·Y의 이름을 적으세요' },
  options: [
    { key: 'fit', label: '회귀선', default: 'band', choices: [['band', '선+예측구간'], ['line', '선만'], ['off', '없음']] },
    { key: 'at', label: 'X가 이 값일 때 Y 예측', default: '', placeholder: '예: 120' }
  ],
  sample: { title: '광고비와 매출', grid: [['월', '광고비(만원)', '매출(만원)'], ['1월', '120', '2100'], ['2월', '150', '2350'], ['3월', '90', '1800'], ['4월', '200', '2900'], ['5월', '170', '2500'], ['6월', '230', '3300'], ['7월', '110', '2050'], ['8월', '260', '3400']] },
  compute(doc, th) {
    const head = doc.grid[0] ?? []
    const rows = doc.grid.slice(1).filter(filled)
    const pts = rows.map((r, i) => ({ x: S.parseNum(r[1]), y: S.parseNum(r[2]), label: r[0]?.trim() || `${i + 1}` })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    if (pts.length < 3) return none('X와 Y 값을 세 쌍 이상 입력하세요')
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    const xName = head[1]?.trim() || 'X'
    const yName = head[2]?.trim() || 'Y'
    if (Math.max(...xs) === Math.min(...xs)) return none('X 값이 모두 같아 관계를 계산할 수 없습니다')
    const reg = S.linReg(xs, ys)
    const at = num(doc, 'at')
    const fit = doc.opts.fit ?? 'band'
    const stats: StatLine[] = [
      { label: '상관계수 r', value: V.fmt(reg.r, 3), strong: true },
      { label: '결정계수 R²', value: V.fmt(reg.r2, 3) },
      { label: '회귀식', value: `Y = ${V.fmt(reg.slope, 3)}·X ${reg.intercept >= 0 ? '+' : '−'} ${V.fmt(Math.abs(reg.intercept), 2)}` },
      { label: '유의확률 p', value: fmtP(reg.p) },
      { label: '순위상관 ρ (Spearman)', value: V.fmt(S.spearman(xs, ys), 3) },
      { label: '표본 수', value: `${pts.length}쌍` }
    ]
    if (Number.isFinite(at) && pts.length > 3) {
      const yhat = reg.slope * at + reg.intercept
      const hw = S.predictionHalfWidth(reg, at)
      stats.push({ label: `X = ${V.fmt(at)}일 때 Y`, value: `${V.fmt(yhat)} (95% 예측 ${V.fmt(yhat - hw)} ~ ${V.fmt(yhat + hw)})`, strong: true })
    }
    return {
      svg: V.scatterChart(pts, th, { xName, yName, fit: fit === 'off' ? undefined : { slope: reg.slope, intercept: reg.intercept, band: fit === 'band' && pts.length > 3 ? (x) => S.predictionHalfWidth(reg, x) : undefined } }),
      stats,
      insight: `${xName}와 ${yName} 사이에는 ${strength(reg.r)}(r = ${V.fmt(reg.r, 2)}). ${xName}가 1 늘 때 ${yName}는 평균 ${signed(reg.slope, 2)} 변하며, ${yName} 변동의 ${pct(reg.r2, 0)}를 설명합니다${reg.p < 0.05 ? '' : ' — 다만 통계적으로 유의하지는 않습니다(p ≥ 0.05)'}.`
    }
  }
}

export const histogram: KindDef = {
  kind: 'histogram',
  section: 'graph',
  name: '히스토그램',
  blurb: '값이 어디에 몰려 있는지 — 분포와 정규곡선',
  grid: { head: ['값'], rows: 12, labelCol: false, growCols: false, growRows: true, hint: '엑셀 한 열을 그대로 붙여 넣으세요' },
  options: [
    { key: 'bins', label: '구간 수', default: '', placeholder: '자동', suffix: '개' },
    { key: 'curve', label: '정규분포 곡선', default: 'on', choices: [['on', '표시'], ['off', '숨김']] }
  ],
  sample: { title: '고객 응대 시간 분포', grid: [['응대 시간(분)'], ...['12', '15', '9', '22', '14', '17', '11', '19', '13', '16', '25', '14', '18', '10', '15', '21', '13', '16', '12', '31'].map((v) => [v])] },
  compute(doc, th) {
    const col = samples(doc)[0]
    if (!col || col.values.length < 5) return none('값을 다섯 개 이상 입력하세요')
    const xs = col.values
    const k = num(doc, 'bins')
    const bins = S.histogram(xs, Number.isFinite(k) && k >= 2 ? Math.min(40, Math.round(k)) : undefined)
    const m = S.mean(xs)
    const s = S.sd(xs)
    const width = bins[0].hi - bins[0].lo
    const top = bins.reduce((a, b) => (b.count > a.count ? b : a))
    const sk = S.skewness(xs)
    return {
      svg: V.histogramChart(bins, th, { xName: col.name, curve: doc.opts.curve !== 'off' && s > 0 ? (x) => S.normPdf(x, m, s) * xs.length * width : undefined }),
      stats: [
        { label: '평균 ± 표준편차', value: `${V.fmt(m)} ± ${V.fmt(s)}`, strong: true },
        { label: '중앙값', value: V.fmt(S.median(xs)) },
        { label: '가장 많은 구간', value: `${V.fmt(top.lo)} ~ ${V.fmt(top.hi)} (${top.count}개)` },
        { label: '왜도', value: V.fmt(sk, 2) },
        { label: '표본 수', value: `${xs.length}개` }
      ],
      insight: `값의 ${pct(xs.filter((x) => Math.abs(x - m) <= s).length / xs.length, 0)}가 평균 ±1 표준편차(${V.fmt(m - s)} ~ ${V.fmt(m + s)}) 안에 있고, 분포는 ${!Number.isFinite(sk) || Math.abs(sk) < 0.5 ? '대체로 좌우 대칭입니다' : sk > 0 ? '오른쪽 꼬리가 긴 편입니다(큰 값 쪽으로 치우친 소수)' : '왼쪽 꼬리가 긴 편입니다(작은 값 쪽으로 치우친 소수)'}.`
    }
  }
}

export const boxStats = (g: { name: string; values: number[] }): V.BoxGroup => ({ name: g.name, ...S.fiveNumber(g.values), mean: S.mean(g.values) })

export const box: KindDef = {
  kind: 'box',
  section: 'graph',
  name: '상자 수염 그림',
  blurb: '그룹별 분포·중앙값·이상치 비교',
  grid: { head: ['그룹 A', '그룹 B', '그룹 C'], rows: 10, labelCol: false, growCols: true, growRows: true, maxCols: 8, hint: '열마다 한 그룹의 값을 세로로 입력하세요' },
  options: [UNIT],
  sample: { title: '지점별 일 매출', grid: [['강남', '홍대', '판교'], ['320', '280', '410'], ['350', '260', '390'], ['290', '310', '450'], ['410', '240', '420'], ['330', '300', '380'], ['360', '270', '640'], ['300', '290', '400'], ['340', '250', '430']], opts: { unit: '만원' } },
  compute(doc, th) {
    const groups = samples(doc).filter((g) => g.values.length >= 3)
    if (!groups.length) return none('그룹마다 값을 세 개 이상 입력하세요')
    const u = unit(doc)
    const bs = groups.map(boxStats)
    const best = bs.reduce((a, b) => (b.median > a.median ? b : a))
    const widest = bs.reduce((a, b) => (b.q3 - b.q1 > a.q3 - a.q1 ? b : a))
    const outliers = S.sum(bs.map((b) => b.outliers.length))
    return {
      svg: V.boxChart(bs, th, { unit: u }),
      stats: [
        { label: '중앙값이 가장 높은 그룹', value: `${best.name} · ${V.fmt(best.median)}${u}`, strong: true },
        { label: '편차가 가장 큰 그룹 (IQR)', value: `${widest.name} · ${V.fmt(widest.q3 - widest.q1)}${u}` },
        { label: '이상치', value: `${outliers}개` }
      ],
      table: { head: ['그룹', 'n', '평균', '중앙값', 'Q1', 'Q3', '이상치'], rows: bs.map((b, i) => [b.name, `${groups[i].values.length}`, V.fmt(b.mean), V.fmt(b.median), V.fmt(b.q1), V.fmt(b.q3), b.outliers.map((x) => V.fmt(x)).join(', ') || '없음']) },
      insight: `‘${best.name}’의 중앙값이 ${V.fmt(best.median)}${u}로 가장 높고, ‘${widest.name}’의 값이 가장 넓게 퍼져 있습니다.${outliers ? ` 상자에서 1.5 IQR 넘게 떨어진 이상치가 ${outliers}개 있습니다(빈 원).` : ''}`
    }
  }
}

export const pareto: KindDef = {
  kind: 'pareto',
  section: 'graph',
  name: '파레토 차트',
  blurb: '핵심 소수 찾기 — 80%를 만드는 원인',
  grid: { head: ['원인', '건수'], rows: 6, labelCol: true, growCols: false, growRows: true, hint: '순서는 상관없습니다. 큰 순서로 정렬해 그립니다' },
  options: [],
  sample: { title: '고객 불만 원인', grid: [['원인', '건수'], ['배송 지연', '142'], ['파손', '61'], ['오배송', '38'], ['응대 불친절', '22'], ['환불 지연', '17'], ['기타', '9']] },
  compute(doc, th) {
    const its = items(doc).filter((i) => i.value > 0).sort((a, b) => b.value - a.value)
    if (its.length < 2) return none('원인 두 개 이상과 건수를 입력하세요')
    const total = S.sum(its.map((i) => i.value))
    let cum = 0
    const vital = its.findIndex((i) => (cum += i.value) / total >= 0.8) + 1
    return {
      svg: V.paretoChart(its, th),
      stats: [
        { label: '80%에 도달하는 원인 수', value: `상위 ${vital}개 / ${its.length}개`, strong: true },
        { label: '1위 원인', value: `${its[0].name} · ${pct(its[0].value / total)}` },
        { label: '합계', value: V.fmt(total) }
      ],
      insight: `상위 ${vital}개 원인(${its.slice(0, vital).map((i) => i.name).join(', ')})이 전체의 ${pct(S.sum(its.slice(0, vital).map((i) => i.value)) / total, 0)}를 차지합니다 — 여기부터 해결하면 효과가 가장 큽니다.`
    }
  }
}

export const waterfall: KindDef = {
  kind: 'waterfall',
  section: 'graph',
  name: '폭포 차트',
  blurb: '시작값에서 증감을 거쳐 최종값까지',
  grid: { head: ['항목', '금액'], rows: 6, labelCol: true, growCols: false, growRows: true, hint: '첫 행은 시작값, 그 아래는 증가(+)·감소(−)를 적으세요' },
  options: [{ key: 'total', label: '마지막 막대 이름', default: '최종', placeholder: '최종', text: true }, UNIT],
  sample: { title: '영업이익 변동 요인', grid: [['항목', '금액'], ['전년 영업이익', '1200'], ['매출 증가', '480'], ['원가 상승', '-260'], ['인건비', '-140'], ['환율 효과', '90'], ['일회성 비용', '-70']], opts: { unit: '백만원', total: '올해 영업이익' } },
  compute(doc, th) {
    const its = items(doc)
    if (its.length < 2) return none('시작값과 증감 항목을 하나 이상 입력하세요')
    const u = unit(doc)
    const [start, ...deltas] = its
    const end = start.value + S.sum(deltas.map((d) => d.value))
    const up = S.sum(deltas.filter((d) => d.value > 0).map((d) => d.value))
    const down = S.sum(deltas.filter((d) => d.value < 0).map((d) => d.value))
    const biggest = deltas.reduce((a, b) => (Math.abs(b.value) > Math.abs(a.value) ? b : a))
    return {
      svg: V.waterfallChart([{ name: start.name, value: start.value, base: true }, ...deltas, { name: doc.opts.total?.trim() || '최종', value: 0, total: true }], th, { unit: u }),
      stats: [
        { label: start.name, value: `${V.fmt(start.value)}${u}` },
        { label: '증가 합계', value: `+${V.fmt(up)}${u}` },
        { label: '감소 합계', value: `−${V.fmt(Math.abs(down))}${u}` },
        { label: doc.opts.total?.trim() || '최종', value: `${V.fmt(end)}${u} (${start.value ? signed(((end - start.value) / Math.abs(start.value)) * 100, 1) : '—'}%)`, strong: true }
      ],
      insight: `${start.name} ${V.fmt(start.value)}${u}에서 ${V.fmt(end)}${u}로 ${end >= start.value ? '늘었습니다' : '줄었습니다'}. 가장 큰 요인은 ‘${biggest.name}’(${signed(biggest.value, 0)}${u})입니다.`
    }
  }
}

export const radar: KindDef = {
  kind: 'radar',
  section: 'graph',
  name: '레이더 차트',
  blurb: '여러 항목의 균형 — 역량·평가 비교',
  grid: { head: ['항목', '대상 1'], rows: 6, labelCol: true, growCols: true, growRows: true, maxCols: 4, hint: '항목 3개 이상, 비교 대상은 3개까지' },
  options: [],
  sample: { title: '후보 솔루션 평가', grid: [['평가 항목', '솔루션 A', '솔루션 B'], ['기능', '8', '6'], ['가격', '5', '9'], ['보안', '9', '7'], ['확장성', '7', '6'], ['지원', '6', '8'], ['사용성', '8', '7']] },
  compute(doc, th) {
    const { cats, series } = labeled(doc)
    const live = series.filter((s) => S.finite(s.values).length >= 3).slice(0, 3)
    if (cats.length < 3 || !live.length) return none('항목 세 개 이상과 점수를 입력하세요')
    const stats = live.flatMap((s) => {
      const best = s.values.indexOf(Math.max(...S.finite(s.values)))
      const worst = s.values.indexOf(Math.min(...S.finite(s.values)))
      return [
        { label: `${s.name} 평균`, value: V.fmt(S.mean(S.finite(s.values)), 2), strong: true },
        { label: `${s.name} 강점 / 약점`, value: `${cats[best]} / ${cats[worst]}` }
      ]
    })
    const avgs = live.map((s) => S.mean(S.finite(s.values)))
    const lead = avgs.indexOf(Math.max(...avgs))
    return {
      svg: V.radarChart(cats, live, th),
      stats,
      insight: live.length > 1 ? `평균 점수는 ‘${live[lead].name}’이 ${V.fmt(avgs[lead], 2)}로 가장 높습니다. 모양이 둥글수록 항목 간 균형이 좋습니다.` : `강점은 ‘${stats[1].value.split(' / ')[0]}’, 약점은 ‘${stats[1].value.split(' / ')[1]}’입니다.`
    }
  }
}

export const heatmap: KindDef = {
  kind: 'heatmap',
  section: 'graph',
  name: '히트맵',
  blurb: '표의 크기를 색으로 — 요일×시간, 지역×월',
  grid: { head: ['', '열 1', '열 2', '열 3', '열 4'], rows: 4, labelCol: true, growCols: true, growRows: true, maxCols: 16, hint: '행·열 이름을 적고 칸에 값을 채우세요' },
  options: [],
  sample: { title: '요일·시간대별 문의 수', grid: [['', '09시', '11시', '13시', '15시', '17시'], ['월', '42', '58', '31', '47', '36'], ['화', '35', '49', '28', '41', '30'], ['수', '30', '44', '26', '38', '29'], ['목', '33', '46', '29', '40', '33'], ['금', '28', '39', '24', '35', '45']] },
  compute(doc, th) {
    const { cats, series } = labeled(doc)
    const vals = cats.map((_, i) => series.map((s) => s.values[i]))
    const flat = vals.flat().filter(Number.isFinite)
    if (flat.length < 2) return none('행과 열 이름, 값을 입력하세요')
    let hi = { v: -Infinity, r: 0, c: 0 }
    let lo = { v: Infinity, r: 0, c: 0 }
    vals.forEach((row, r) => row.forEach((v, c) => {
      if (v > hi.v) hi = { v, r, c }
      if (v < lo.v) lo = { v, r, c }
    }))
    const rowSums = vals.map((r) => S.sum(S.finite(r)))
    const top = rowSums.indexOf(Math.max(...rowSums))
    return {
      svg: V.heatmapChart(cats, series.map((s) => s.name), vals, th),
      stats: [
        { label: '가장 높은 칸', value: `${cats[hi.r]} × ${series[hi.c].name} · ${V.fmt(hi.v)}`, strong: true },
        { label: '가장 낮은 칸', value: `${cats[lo.r]} × ${series[lo.c].name} · ${V.fmt(lo.v)}` },
        { label: '합계가 가장 큰 행', value: `${cats[top]} · ${V.fmt(rowSums[top])}` },
        { label: '전체 평균', value: V.fmt(S.mean(flat)) }
      ],
      insight: `‘${cats[hi.r]} × ${series[hi.c].name}’이 ${V.fmt(hi.v)}로 가장 높고(평균의 ${V.fmt(hi.v / S.mean(flat), 1)}배), 행 중에서는 ‘${cats[top]}’의 합계가 가장 큽니다.`
    }
  }
}

export const bullet: KindDef = {
  kind: 'bullet',
  section: 'graph',
  name: '목표 대비 실적',
  blurb: 'KPI 달성률 — 항목별 실적과 목표선',
  grid: { head: ['항목', '실적', '목표'], rows: 4, labelCol: true, growCols: false, growRows: true, hint: '항목마다 실적과 목표를 입력하세요' },
  options: [UNIT],
  sample: { title: '3분기 팀별 매출 목표 달성', grid: [['팀', '실적', '목표'], ['영업 1팀', '4.6', '4.2'], ['영업 2팀', '3.1', '3.8'], ['파트너', '2.4', '2.5'], ['온라인', '5.3', '4.5']], opts: { unit: '억원' } },
  compute(doc, th) {
    const { cats, series } = labeled(doc)
    const rows = cats.map((name, i) => ({ name, actual: series[0]?.values[i] ?? NaN, target: series[1]?.values[i] ?? NaN })).filter((r) => Number.isFinite(r.actual) && r.target > 0)
    if (!rows.length) return none('항목별 실적과 목표(0보다 큰 값)를 입력하세요')
    const u = unit(doc)
    const totalA = S.sum(rows.map((r) => r.actual))
    const totalT = S.sum(rows.map((r) => r.target))
    const met = rows.filter((r) => r.actual >= r.target)
    const worst = rows.reduce((a, b) => (b.actual / b.target < a.actual / a.target ? b : a))
    return {
      svg: V.bulletChart(rows, th, { unit: u }),
      stats: [
        { label: '전체 달성률', value: pct(totalA / totalT), strong: true },
        { label: '달성 항목', value: `${met.length} / ${rows.length}개` },
        { label: '실적 합계 / 목표 합계', value: `${V.fmt(totalA)} / ${V.fmt(totalT)}${u}` },
        { label: '달성률이 가장 낮은 항목', value: `${worst.name} · ${pct(worst.actual / worst.target, 0)}` }
      ],
      insight: `${rows.length}개 중 ${met.length}개 항목이 목표를 달성했고 전체 달성률은 ${pct(totalA / totalT)}입니다.${met.length < rows.length ? ` ‘${worst.name}’이 목표까지 ${V.fmt(worst.target - worst.actual)}${u} 남아 가장 뒤처져 있습니다.` : ''}`
    }
  }
}

export const treemap: KindDef = {
  kind: 'treemap',
  section: 'graph',
  name: '트리맵',
  blurb: '많은 항목의 비중을 면적으로',
  grid: { head: ['항목', '값'], rows: 8, labelCol: true, growCols: false, growRows: true, hint: '항목이 많을 때 원형 그래프보다 읽기 쉽습니다' },
  options: [UNIT],
  sample: { title: '제품별 매출 비중', grid: [['제품', '매출'], ['프로 요금제', '4200'], ['베이직 요금제', '2600'], ['엔터프라이즈', '3900'], ['애드온 저장소', '820'], ['교육 서비스', '640'], ['컨설팅', '1100'], ['하드웨어', '450'], ['기타', '230']], opts: { unit: '만원' } },
  compute(doc, th) {
    const its = items(doc).filter((i) => i.value > 0)
    if (its.length < 2) return none('항목 두 개 이상과 값을 입력하세요')
    const u = unit(doc)
    const total = S.sum(its.map((i) => i.value))
    const top = [...its].sort((a, b) => b.value - a.value)
    return {
      svg: V.treemapChart(its, th, { unit: u }),
      stats: [
        { label: '합계', value: `${V.fmt(total)}${u}`, strong: true },
        { label: '가장 큰 항목', value: `${top[0].name} · ${pct(top[0].value / total)}` },
        { label: '항목 수', value: `${its.length}개` }
      ],
      insight: `‘${top[0].name}’과 ‘${top[1].name}’이 합쳐 전체의 ${pct((top[0].value + top[1].value) / total, 0)}를 차지합니다.`
    }
  }
}

export const dumbbell: KindDef = {
  kind: 'dumbbell',
  section: 'graph',
  name: '전후 비교',
  blurb: '항목별 이전 → 이후 변화 (덤벨 차트)',
  grid: { head: ['항목', '이전', '이후'], rows: 5, labelCol: true, growCols: false, growRows: true, hint: '머리글에 비교 시점(예: 2025, 2026)을 적으세요' },
  options: [UNIT],
  sample: { title: '개선 전후 처리 시간', grid: [['업무', '도입 전', '도입 후'], ['견적 작성', '45', '18'], ['계약 검토', '120', '75'], ['정산', '90', '40'], ['보고서', '60', '35'], ['온보딩', '240', '150']], opts: { unit: '분' } },
  compute(doc, th) {
    const { cats, series } = labeled(doc)
    const [a, b] = series
    if (!a || !b) return none('항목, 이전 값, 이후 값을 입력하세요')
    const idx = cats.map((_, i) => i).filter((i) => Number.isFinite(a.values[i]) && Number.isFinite(b.values[i]))
    if (!idx.length) return none('이전과 이후 값을 함께 입력하세요')
    const u = unit(doc)
    const d = idx.map((i) => ({ name: cats[i], d: b.values[i] - a.values[i], r: a.values[i] ? (b.values[i] - a.values[i]) / Math.abs(a.values[i]) : NaN }))
    const up = d.reduce((x, y) => (y.d > x.d ? y : x))
    const down = d.reduce((x, y) => (y.d < x.d ? y : x))
    const sa = S.sum(idx.map((i) => a.values[i]))
    const sb = S.sum(idx.map((i) => b.values[i]))
    return {
      svg: V.dumbbellChart(idx.map((i) => cats[i]), { name: a.name, values: idx.map((i) => a.values[i]) }, { name: b.name, values: idx.map((i) => b.values[i]) }, th, { unit: u }),
      stats: [
        { label: '합계 변화', value: `${V.fmt(sa)} → ${V.fmt(sb)}${u} (${sa ? signed(((sb - sa) / Math.abs(sa)) * 100, 1) : '—'}%)`, strong: true },
        { label: '가장 크게 증가', value: up.d > 0 ? `${up.name} · ${signed(up.d)}${u}` : '없음' },
        { label: '가장 크게 감소', value: down.d < 0 ? `${down.name} · ${signed(down.d)}${u}` : '없음' },
        { label: '평균 변화', value: `${signed(S.mean(d.map((x) => x.d)))}${u}` }
      ],
      insight: `${a.name} 대비 ${b.name} 합계는 ${sa ? pct(Math.abs(sb - sa) / Math.abs(sa)) : ''} ${sb >= sa ? '늘었습니다' : '줄었습니다'}. 변화가 가장 큰 항목은 ‘${Math.abs(up.d) >= Math.abs(down.d) ? up.name : down.name}’입니다.`
    }
  }
}

