import assert from 'node:assert'
import * as S from './stats'

const near = (a: number, b: number, tol = 1e-4): void => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`)

// Reference values: R / Excel.
const xs = [2, 4, 4, 4, 5, 5, 7, 9]
near(S.mean(xs), 5)
near(S.sd(xs), 2.13809, 1e-5)
near(S.quantile(xs, 0.25), 4)
near(S.median([1, 3, 2, 4]), 2.5)
assert.deepEqual(S.modes(xs), [4])
near(S.skewness(xs), 0.8184, 1e-3)
near(S.kurtosis(xs), 0.9406, 1e-3)
assert.deepEqual(S.fiveNumber([1, 2, 3, 4, 100]).outliers, [100])
assert.equal(S.parseNum('1,234.5원'), 1234.5)
assert.ok(Number.isNaN(S.parseNum('abc')))
assert.ok(Number.isNaN(S.parseNum('')))

near(S.normCdf(1.959964), 0.975, 1e-6)
near(S.normCdf(-1), 0.158655, 1e-6)
near(S.normInv(0.975), 1.959964, 1e-6)
near(S.tInv(0.975, 10), 2.228139, 1e-5)
near(S.tTwoTail(2.228139, 10), 0.05, 1e-5)
near(S.chi2Upper(3.841459, 1), 0.05, 1e-5)
near(S.fUpper(4.10, 2, 10), 0.0502, 1e-3)

// Hand-derived: means 7 / 3.2, variances 2.5 / 3.7 → se² = 1.24, t = 3.8/√1.24, df = 1.24²/0.1994
const w = S.welch([5, 6, 7, 8, 9], [1, 2, 3, 4, 6])
near(w.t, 3.8 / Math.sqrt(1.24), 1e-9)
near(w.df, 1.5376 / 0.1994, 1e-6)
near(S.tTwoTail(w.t, w.df), w.p, 1e-12)
assert.ok(w.p > 0.005 && w.p < 0.015)
assert.ok(w.ciLo > 0 && w.ciHi > w.ciLo)

const reg = S.linReg([1, 2, 3, 4, 5], [2, 4, 5, 4, 5])
near(reg.slope, 0.6)
near(reg.intercept, 2.2)
near(reg.r2, 0.6, 1e-6)
near(S.spearman([1, 2, 3, 4], [10, 20, 30, 25]), 0.8)

// oneway: groups (1,2,3) (4,5,6) (7,8,9): F = 27, p = 0.001
const a = S.anova([[1, 2, 3], [4, 5, 6], [7, 8, 9]])
near(a.f, 27)
near(a.p, 0.001, 1e-4)

// chisq.test(matrix(c(10,20,30,40),2), correct=F): X² = 0.7937, p = 0.373
const c = S.chiSquare([[10, 30], [20, 40]])
near(c.chi2, 0.79365, 1e-4)
near(c.p, 0.37301, 1e-4)

const ab = S.twoProportion(1000, 100, 1000, 130)
near(ab.z, 0.03 / Math.sqrt(0.115 * 0.885 * 0.002), 1e-9)
near(ab.lift, 0.3)

assert.equal(S.sampleSize(0.95, 0.05), 385)
assert.equal(S.sampleSize(0.95, 0.05, 0.5, 1000), 278)
near(S.marginOfError(0.95, 385), 0.04995, 1e-4)

const bins = S.histogram([1, 2, 2, 3, 3, 3, 4, 4, 5, 10])
assert.equal(S.sum(bins.map((b) => b.count)), 10)
assert.ok(bins[0].lo <= 1 && bins[bins.length - 1].hi >= 10)
assert.deepEqual(S.movingAverage([1, 2, 3, 4], 2).slice(1), [1.5, 2.5, 3.5])
console.log('chart stats: all assertions passed')

// --- Every kind renders its sample, in both themes, without NaN leaking into the SVG ---
import { KINDS, computeReport, emptyDoc, parseChartDoc, sampleDoc } from './kinds'
for (const def of KINDS) {
  for (const theme of ['light', 'dark'] as const) {
    const r = computeReport(sampleDoc(def.kind), theme)
    assert.ok(r.svg.startsWith('<svg'), `${def.kind}: no chart (${r.empty})`)
    assert.ok(!/NaN|Infinity|undefined/.test(r.svg), `${def.kind}: bad number in SVG`)
    assert.ok(r.stats.length > 0 && r.insight.length > 10, `${def.kind}: no stats/insight`)
    assert.ok(!/NaN|undefined/.test(r.insight + JSON.stringify(r.stats) + JSON.stringify(r.table ?? '')), `${def.kind}: bad text ${r.insight}`)
  }
  const blank = computeReport(emptyDoc(def.kind))
  assert.equal(blank.svg, '', `${def.kind}: empty doc should not draw`)
  assert.ok(blank.empty, `${def.kind}: empty doc needs a hint`)
  assert.deepEqual(parseChartDoc(JSON.stringify(sampleDoc(def.kind))), sampleDoc(def.kind))
}
assert.equal(parseChartDoc('{"kind":"nope"}'), null)
assert.equal(parseChartDoc('not json'), null)
console.log(`chart kinds: ${KINDS.length} kinds render`)

// --- Markdown fence round trip -------------------------------------------------
import { chartMarkdown, replaceChartFences, chartSummaryMarkdown } from './html'
{
  const doc = { ...sampleDoc('bar'), title: 'with `backticks` and ``` fences' }
  const md = `# memo\n\nintro\n\n${chartMarkdown(doc)}\n\nafter`
  const seen: unknown[] = []
  const out = replaceChartFences(md, (d) => {
    seen.push(d)
    return '[chart]'
  })
  assert.equal(out, '# memo\n\nintro\n\n[chart]\n\nafter')
  assert.deepEqual(seen, [doc])
  assert.equal(replaceChartFences('```aop-chart\n{broken\n```', () => 'x'), '```aop-chart\n{broken\n```')
  assert.ok(chartSummaryMarkdown(doc).includes('| 합계 |'))
}
console.log('chart fences: round trip ok')
