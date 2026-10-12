// Korean money units in number inputs: '3억 5천만', '1500만', '2.5억'.

export const HAS_KOREAN_UNIT = /[조억만천백십]/
const BIG_UNIT: Record<string, number> = { 조: 1e12, 억: 1e8, 만: 1e4 }
const SMALL_UNIT: Record<string, number> = { 천: 1e3, 백: 1e2, 십: 10 }

/** '3억 5천만' → 350000000, '1500만' → 15000000, '2.5억' → 250000000; NaN if it isn't an amount. */
export function parseKoreanAmount(raw: string): number {
  const s = raw.replace(/[\s,원]/g, '')
  const neg = s.startsWith('-')
  const body = neg ? s.slice(1) : s
  if (!/^\d[\d.조억만천백십]*$/.test(body)) return NaN
  let total = 0
  let group = 0 // the part below the next 만/억/조 ('5천' in '5천만')
  let cur = 0
  for (const [tok] of body.matchAll(/\d+(?:\.\d+)?|[조억만천백십]/g)) {
    if (BIG_UNIT[tok]) {
      total += (group + cur) * BIG_UNIT[tok]
      group = cur = 0
    } else if (SMALL_UNIT[tok]) {
      group += (cur || 1) * SMALL_UNIT[tok]
      cur = 0
    } else cur = Number(tok)
  }
  return (neg ? -1 : 1) * (total + group + cur)
}

