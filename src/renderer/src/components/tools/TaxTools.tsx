import { amountInWords, fmt, grossFromNet, koreanWon, num, withholding } from '@/lib/toolMath'
import { AddButton, CopyButton, EMPTY, Field, Note, Plate, Readout, RemoveButton, RowHeader, RowInput, Segmented, Stat, ToolLayout, newRowId, usePersistentState } from './ui'

const wonText = (n: number): string => (Number.isFinite(n) ? `${fmt(Math.round(n))}원` : EMPTY)

interface QuoteRow {
  id: string
  name: string
  qty: string
  price: string
}
type VatMode = 'separate' | 'included' | 'exempt'

export function QuoteTool(): JSX.Element {
  const [rows, setRows] = usePersistentState<QuoteRow[]>('quote.rows', [{ id: 'r1', name: '', qty: '', price: '' }])
  const [discount, setDiscount] = usePersistentState('quote.discount', '')
  const [vatMode, setVatMode] = usePersistentState<VatMode>('quote.vat', 'separate')
  const set = (id: string, patch: Partial<QuoteRow>): void => setRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const lines = rows.map((r) => ({ ...r, amount: (Number.isFinite(num(r.qty)) ? num(r.qty) : 1) * num(r.price) }))
  const filled = lines.filter((l) => Number.isFinite(l.amount))
  const subtotal = filled.reduce((s, l) => s + l.amount, 0)
  const off = Math.round((subtotal * (num(discount) || 0)) / 100)
  const afterDiscount = subtotal - off
  // 'included': prices already contain VAT; split it out of the total.
  const supply = vatMode === 'included' ? Math.round(afterDiscount / 1.1) : afterDiscount
  const tax = vatMode === 'exempt' ? 0 : vatMode === 'included' ? afterDiscount - supply : Math.round(afterDiscount * 0.1)
  const total = supply + tax
  const has = filled.length > 0
  const summary = [
    ...filled.map((l) => `${l.name || '품목'}\t${fmt(Number.isFinite(num(l.qty)) ? num(l.qty) : 1, 2)}\t${fmt(num(l.price))}\t${fmt(l.amount)}`),
    off ? `할인 (${fmt(num(discount), 1)}%)\t\t\t-${fmt(off)}` : '',
    `공급가액\t\t\t${fmt(supply)}`,
    `부가세\t\t\t${fmt(tax)}`,
    `합계\t\t\t${fmt(total)}`
  ]
    .filter(Boolean)
    .join('\n')
  return (
    <ToolLayout
      wide
      inputs={
        <>
          <Segmented label="단가 기준" value={vatMode} onChange={setVatMode} options={[['separate', '부가세 별도'], ['included', '부가세 포함가'], ['exempt', '면세']]} />
          <div className="flex flex-col gap-1.5">
            <RowHeader name="품목" cols={[{ label: '수량' }, { label: '단가', money: true }]} />
            {rows.map((r) => (
              <div key={r.id} className="flex items-center gap-2">
                <RowInput wide label="품목" placeholder="예: 웹사이트 디자인" value={r.name} onChange={(v) => set(r.id, { name: v })} />
                <RowInput label="수량" placeholder="1" value={r.qty} onChange={(v) => set(r.id, { qty: v })} />
                <RowInput money label="단가" placeholder="0" value={r.price} onChange={(v) => set(r.id, { price: v })} />
                <RemoveButton disabled={rows.length <= 1} onClick={() => setRows(rows.filter((x) => x.id !== r.id))} />
              </div>
            ))}
            <AddButton label="품목 추가" onClick={() => setRows([...rows, { id: newRowId(), name: '', qty: '', price: '' }])} />
          </div>
          <Field label="할인율 (선택)" value={discount} onChange={setDiscount} suffix="%" placeholder="0" />
        </>
      }
      readout={
        <Readout label="견적 합계" value={has ? fmt(total) : EMPTY} unit="원" sub={has ? `일금 ${amountInWords(total, 'hangul')}원정` : undefined} emptyHint="품목의 단가를 입력하세요">
          <Stat label="품목 합계" value={has ? wonText(subtotal) : EMPTY} />
          {off > 0 && <Stat label="할인" value={`-${wonText(off)}`} />}
          <Stat label="공급가액" value={has ? wonText(supply) : EMPTY} />
          <Stat label="부가세" value={has ? wonText(tax) : EMPTY} />
          {has && (
            <div className="mt-2 flex items-center justify-end gap-1 text-[12px] text-muted-foreground">
              표로 복사 <CopyButton text={summary} label="견적 내역을 표로 복사" />
            </div>
          )}
        </Readout>
      }
    />
  )
}

export function WithholdingTool(): JSX.Element {
  const [kind, setKind] = usePersistentState<'3' | '8'>('withholding.kind', '3')
  const [from, setFrom] = usePersistentState<'gross' | 'net'>('withholding.from', 'gross')
  const [amount, setAmount] = usePersistentState('withholding.amount', '')
  const rate = kind === '3' ? 3 : 8
  const a = num(amount)
  const ok = Number.isFinite(a) && a >= 0
  const r = ok ? withholding(from === 'gross' ? a : grossFromNet(a, rate), rate) : null
  return (
    <ToolLayout
      inputs={
        <>
          <Segmented label="소득 종류" value={kind} onChange={setKind} options={[['3', '사업소득 3.3%'], ['8', '기타소득 8.8%']]} />
          <Segmented label="입력 기준" value={from} onChange={setFrom} options={[['gross', '지급액(세전)에서'], ['net', '실수령액에서']]} />
          <Field won label={from === 'gross' ? '지급액 (세전)' : '받을 실수령액'} value={amount} onChange={setAmount} placeholder="1,000,000" />
          <Note>
            {kind === '3'
              ? '프리랜서·강사료 등 사업소득: 소득세 3% + 지방소득세 0.3%.'
              : '일시적 강연료·원고료 등 기타소득: 필요경비 60% 공제 후 20%, 즉 지급액의 8% + 지방소득세 0.8%.'}{' '}
            세액은 10원 미만을 버립니다.
          </Note>
        </>
      }
      readout={
        <Readout label={from === 'gross' ? '실수령액' : '지급해야 할 금액 (세전)'} value={r ? fmt(from === 'gross' ? r.net : r.gross) : EMPTY} unit="원" sub={r ? koreanWon(from === 'gross' ? r.net : r.gross) : undefined}>
          <Stat label="지급액 (세전)" value={r ? wonText(r.gross) : EMPTY} />
          <Stat label={`소득세 (${rate}%)`} value={r ? wonText(r.income) : EMPTY} />
          <Stat label={`지방소득세 (${rate / 10}%)`} value={r ? wonText(r.local) : EMPTY} />
          <Stat label="원천징수 합계" value={r ? wonText(r.income + r.local) : EMPTY} strong />
        </Readout>
      }
    />
  )
}

export function AmountWordsTool(): JSX.Element {
  const [amount, setAmount] = usePersistentState('amount-words.amount', '')
  const a = Math.floor(num(amount))
  const ok = Number.isFinite(a) && a >= 0 && a < 1e20
  const lines = ok
    ? [
        ['계약서·영수증', `일금 ${amountInWords(a, 'hangul')}원정 (₩${fmt(a)})`],
        ['한글', `${amountInWords(a, 'hangul')}원`],
        ['한자 (갖은자)', `金 ${amountInWords(a, 'hanja')}圓整`],
        ['단위 표기', koreanWon(a)],
        ['숫자', `₩${fmt(a)}`]
      ]
    : []
  return (
    <ToolLayout
      inputs={
        <>
          <Field won label="금액" value={amount} onChange={setAmount} placeholder="12,345,000" />
          <Note>계약서·차용증·영수증에 쓰는 표기입니다. 위·변조를 막도록 ‘일백’, ‘일천’처럼 1도 빠짐없이 적습니다.</Note>
        </>
      }
      readout={
        <Plate label="표기">
          {!ok ? (
            <p className="py-8 text-center text-[13px] text-muted-foreground">금액을 입력하면 여러 표기로 바꿔 드립니다.</p>
          ) : (
            <ul className="space-y-1">
              {lines.map(([label, text]) => (
                <li key={label} className="group flex items-start gap-2 rounded-xl px-2 py-2 transition-colors hover:bg-background/60">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] text-muted-foreground">{label}</span>
                    <span className="block break-all text-[15px] font-medium leading-snug">{text}</span>
                  </span>
                  <CopyButton text={text} label={`${label} 복사`} />
                </li>
              ))}
            </ul>
          )}
        </Plate>
      }
    />
  )
}
