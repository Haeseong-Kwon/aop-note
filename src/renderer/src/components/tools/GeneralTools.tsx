import { useState, type KeyboardEvent } from 'react'
import { ArrowLeftRight, Delete, Shuffle, Trash2 } from 'lucide-react'
import { evaluate, fmt, koreanWon, num } from '@/lib/toolMath'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { EMPTY, Field, FieldRow, Note, Readout, Segmented, Stat, ToolLayout, usePersistentState } from './ui'

// --- Calculator ----------------------------------------------------------------

const KEYS: readonly (readonly [string, string?])[] = [
  ['C'], ['('], [')'], ['÷', '÷'],
  ['7'], ['8'], ['9'], ['×', '×'],
  ['4'], ['5'], ['6'], ['-'],
  ['1'], ['2'], ['3'], ['+'],
  ['%'], ['0'], ['.'], ['=']
]
const OPS = new Set(['÷', '×', '-', '+', '='])

const tryEval = (expr: string): number | null => {
  try {
    return evaluate(expr)
  } catch {
    return null
  }
}

export function CalculatorTool(): JSX.Element {
  const [expr, setExpr] = usePersistentState('calculator.expr', '')
  const [history, setHistory] = usePersistentState<{ expr: string; result: number }[]>('calculator.history', [])
  const preview = expr.trim() ? tryEval(expr) : null

  const commit = (): void => {
    const v = tryEval(expr)
    if (v === null) return
    setHistory([{ expr, result: v }, ...history].slice(0, 30))
    setExpr(String(Number(v.toPrecision(12))))
  }
  const press = (k: string): void => {
    if (k === 'C') setExpr('')
    else if (k === '=') commit()
    else setExpr(expr + k)
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault()
      commit()
    } else if (e.key === 'Escape') setExpr('')
  }

  return (
    <ToolLayout
      inputs={
        <>
          <div className="tool-plate rounded-[1.25rem] p-4">
            <input
              autoFocus
              value={expr}
              onChange={(e) => setExpr(e.target.value)}
              onKeyDown={onKey}
              placeholder="12,500 × 3 + 10%"
              aria-label="수식"
              className="w-full bg-transparent text-right text-xl tabular-nums outline-none placeholder:text-muted-foreground/40"
            />
            <output className="mt-1 block min-h-[3rem] truncate text-right text-[2.5rem] font-semibold leading-tight tracking-[-0.03em] tabular-nums">
              {preview === null ? (expr ? <span className="text-base font-normal text-muted-foreground">수식을 완성하세요</span> : '0') : fmt(preview, 10)}
            </output>
            {preview !== null && Math.abs(preview) >= 10_000 && <p className="text-right text-[12px] text-muted-foreground">{koreanWon(preview).replace(/원$/, '')}</p>}
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {KEYS.map(([k]) => (
              <button
                key={k}
                onClick={() => press(k)}
                className={cn(
                  'h-12 rounded-xl text-lg tabular-nums transition-all duration-fast active:scale-95',
                  k === '=' ? 'bg-[color:var(--tool)] font-semibold text-white hover:opacity-90' : OPS.has(k) ? 'bg-[color:var(--tool-soft)] font-medium text-[color:var(--tool)] hover:brightness-95' : k === 'C' ? 'bg-muted text-muted-foreground hover:text-foreground' : 'bg-background/70 shadow-sm ring-1 ring-inset ring-border hover:bg-accent'
                )}
              >
                {k}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between text-[12px] text-muted-foreground">
            <span>키보드로 입력하고 Enter. sqrt(), log(), ^, pi 지원</span>
            <button onClick={() => setExpr(expr.slice(0, -1))} aria-label="한 글자 지우기" className="rounded p-1 hover:bg-accent hover:text-foreground">
              <Delete className="h-4 w-4" />
            </button>
          </div>
        </>
      }
      readout={
        <section className="tool-plate rounded-[1.25rem] p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12px] font-medium text-[color:var(--tool)]">기록</span>
            {history.length > 0 && (
              <button onClick={() => setHistory([])} aria-label="기록 지우기" className="rounded p-1 text-muted-foreground hover:bg-background/60 hover:text-foreground">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {history.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted-foreground">계산하면 여기에 쌓입니다. 누르면 다시 불러옵니다.</p>
          ) : (
            <ul className="max-h-80 space-y-0.5 overflow-y-auto">
              {history.map((h, i) => (
                <li key={i}>
                  <button onClick={() => setExpr(h.expr)} className="w-full rounded-lg px-2 py-1.5 text-right hover:bg-background/50">
                    <span className="block truncate text-[12px] text-muted-foreground">{h.expr} =</span>
                    <span className="block text-[15px] font-medium tabular-nums">{fmt(h.result, 10)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      }
    />
  )
}

// --- Percent -------------------------------------------------------------------

export function PercentTool(): JSX.Element {
  const [mode, setMode] = usePersistentState<'of' | 'change' | 'ratio'>('percent.mode', 'change')
  const [a, setA] = usePersistentState('percent.a', '')
  const [b, setB] = usePersistentState('percent.b', '')
  const x = num(a)
  const y = num(b)
  const result = mode === 'of' ? (x * y) / 100 : mode === 'change' ? ((y - x) / Math.abs(x)) * 100 : (x / y) * 100
  const labels = { of: ['전체 값', '비율 (%)', '2,400,000', '15'], change: ['이전 값', '현재 값', '1,200', '1,500'], ratio: ['부분 값', '전체 값', '350', '2,000'] }[mode]
  return (
    <ToolLayout
      inputs={
        <>
          <Segmented label="계산" value={mode} onChange={setMode} options={[['change', '증감률'], ['of', 'A의 B%'], ['ratio', '비중']]} />
          <FieldRow>
            <Field label={labels[0]} value={a} onChange={setA} placeholder={labels[2]} />
            <Field label={labels[1]} value={b} onChange={setB} placeholder={labels[3]} />
          </FieldRow>
          <Note>{mode === 'change' ? '전년 대비, 전월 대비 성장률을 구할 때 씁니다.' : mode === 'of' ? '예: 매출의 15%가 얼마인지.' : '예: 전체 예산에서 이 항목이 차지하는 비중.'}</Note>
        </>
      }
      readout={
        <Readout
          label={mode === 'change' ? '증감률' : mode === 'of' ? `${fmt(x)}의 ${fmt(y, 2)}%` : '비중'}
          value={Number.isFinite(result) ? (mode === 'of' ? fmt(result, 4) : `${result > 0 && mode === 'change' ? '+' : ''}${fmt(result, 2)}%`) : EMPTY}
          sub={mode === 'change' && Number.isFinite(y - x) ? `차이 ${y - x > 0 ? '+' : ''}${fmt(y - x, 4)}` : undefined}
        >
          {mode === 'change' && <Stat label="배수" value={Number.isFinite(y / x) ? `${fmt(y / x, 3)}배` : EMPTY} />}
        </Readout>
      }
    />
  )
}

// --- Unit converter --------------------------------------------------------------

type Category = 'length' | 'area' | 'weight' | 'volume' | 'data' | 'temp'
/** Factors to the category's base unit (temperature is special-cased). */
const UNITS: Record<Category, { label: string; units: [string, string, number][] }> = {
  length: { label: '길이', units: [['mm', '밀리미터', 0.001], ['cm', '센티미터', 0.01], ['m', '미터', 1], ['km', '킬로미터', 1000], ['in', '인치', 0.0254], ['ft', '피트', 0.3048], ['yd', '야드', 0.9144], ['mi', '마일', 1609.344]] },
  area: { label: '넓이', units: [['m2', '제곱미터 (㎡)', 1], ['pyeong', '평', 400 / 121], ['km2', '제곱킬로미터', 1e6], ['ha', '헥타르', 1e4], ['ft2', '제곱피트', 0.09290304], ['acre', '에이커', 4046.8564224]] },
  weight: { label: '무게', units: [['g', '그램', 1], ['kg', '킬로그램', 1000], ['t', '톤', 1e6], ['oz', '온스', 28.349523125], ['lb', '파운드', 453.59237], ['geun', '근 (600g)', 600], ['don', '돈 (3.75g)', 3.75]] },
  volume: { label: '부피', units: [['ml', '밀리리터', 0.001], ['l', '리터', 1], ['m3', '세제곱미터', 1000], ['gal', '갤런 (US)', 3.785411784], ['floz', '액량 온스 (US)', 0.0295735295625], ['cup', '컵 (US)', 0.2365882365]] },
  data: { label: '데이터', units: [['B', '바이트', 1], ['KB', '킬로바이트', 1024], ['MB', '메가바이트', 1024 ** 2], ['GB', '기가바이트', 1024 ** 3], ['TB', '테라바이트', 1024 ** 4], ['bit', '비트', 1 / 8]] },
  temp: { label: '온도', units: [['C', '섭씨 (°C)', 1], ['F', '화씨 (°F)', 1], ['K', '켈빈 (K)', 1]] }
}

function convert(cat: Category, value: number, from: string, to: string): number {
  if (cat === 'temp') {
    const c = from === 'C' ? value : from === 'F' ? ((value - 32) * 5) / 9 : value - 273.15
    return to === 'C' ? c : to === 'F' ? (c * 9) / 5 + 32 : c + 273.15
  }
  const f = (u: string): number => UNITS[cat].units.find(([id]) => id === u)?.[2] ?? NaN
  return (value * f(from)) / f(to)
}

export function UnitTool(): JSX.Element {
  const [cat, setCat] = usePersistentState<Category>('units.cat', 'area')
  const [value, setValue] = usePersistentState('units.value', '')
  const [from, setFrom] = usePersistentState('units.from', 'm2')
  const [to, setTo] = usePersistentState('units.to', 'pyeong')
  const units = UNITS[cat].units
  const valid = (u: string): boolean => units.some(([id]) => id === u)
  const f = valid(from) ? from : units[0][0]
  const t = valid(to) ? to : units[1][0]
  const v = num(value)
  const result = convert(cat, v, f, t)
  const name = (u: string): string => units.find(([id]) => id === u)?.[1] ?? u
  return (
    <ToolLayout
      inputs={
        <>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="종류">
            {(Object.keys(UNITS) as Category[]).map((c) => (
              <button
                key={c}
                role="radio"
                aria-checked={cat === c}
                onClick={() => {
                  setCat(c)
                  setFrom(UNITS[c].units[0][0])
                  setTo(UNITS[c].units[1][0])
                }}
                className={cn('h-8 rounded-full px-3.5 text-[13px] transition-colors', cat === c ? 'bg-[color:var(--tool)] text-white' : 'bg-muted/70 text-muted-foreground hover:text-foreground')}
              >
                {UNITS[c].label}
              </button>
            ))}
          </div>
          <Field label="값" value={value} onChange={setValue} placeholder="변환할 값" />
          <div className="flex items-end gap-2">
            <UnitSelect label="에서" value={f} units={units} onChange={setFrom} />
            <button onClick={() => (setFrom(t), setTo(f))} aria-label="단위 바꾸기" className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground">
              <ArrowLeftRight className="h-4 w-4" />
            </button>
            <UnitSelect label="으로" value={t} units={units} onChange={setTo} />
          </div>
        </>
      }
      readout={
        <Readout label={`${fmt(v, 6)} ${name(f)} =`} value={Number.isFinite(result) ? fmt(result, 6) : EMPTY} unit={name(t)}>
          {units
            .filter(([id]) => id !== f && id !== t)
            .map(([id, label]) => (
              <Stat key={id} label={label} value={fmt(convert(cat, v, f, id), 6)} />
            ))}
        </Readout>
      }
    />
  )
}

function UnitSelect({ label, value, units, onChange }: { label: string; value: string; units: [string, string, number][]; onChange: (v: string) => void }): JSX.Element {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1.5">
      <span className="text-[12px] font-medium text-muted-foreground">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="field h-10 rounded-lg text-[14px]">
        {units.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
    </label>
  )
}

// --- Text counter ------------------------------------------------------------------

export function TextCountTool(): JSX.Element {
  const [text, setText] = usePersistentState('text.value', '')
  const chars = [...text].length
  const noSpace = [...text.replace(/\s/g, '')].length
  const words = text.trim() ? text.trim().split(/\s+/).length : 0
  const lines = text ? text.split('\n').length : 0
  const bytes = new TextEncoder().encode(text).length
  // EUC-KR style count (한글 2바이트) — what many Korean forms and SMS limits use.
  const bytes2 = [...text].reduce((s, ch) => s + (ch.charCodeAt(0) > 127 ? 2 : 1), 0)
  const readMin = noSpace / 500
  return (
    <ToolLayout
      inputs={
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="자기소개서, 공고문, 보도자료 등을 붙여 넣으세요."
            aria-label="텍스트"
            className="min-h-[18rem] resize-y rounded-xl border border-input bg-background/80 p-4 text-[14px] leading-relaxed outline-none transition-shadow placeholder:text-muted-foreground/45 focus:border-[color:var(--tool)] focus:shadow-[0_0_0_3px_var(--tool-soft)]"
          />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setText(text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim())} disabled={!text}>
              공백 정리
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setText('')} disabled={!text}>
              지우기
            </Button>
          </div>
        </>
      }
      readout={
        <Readout label="공백 포함" value={fmt(chars)} unit="자" sub={`공백 제외 ${fmt(noSpace)}자`}>
          <Stat label="단어" value={fmt(words)} />
          <Stat label="줄" value={fmt(lines)} />
          <Stat label="바이트 (UTF-8)" value={fmt(bytes)} />
          <Stat label="바이트 (한글 2바이트)" value={fmt(bytes2)} strong />
          <Stat label="원고지 (200자)" value={`${fmt(Math.ceil(chars / 200))}매`} />
          <Stat label="읽는 시간" value={readMin < 1 ? '1분 미만' : `약 ${fmt(Math.ceil(readMin))}분`} />
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
            {[
              ['SMS', 90],
              ['LMS', 2000]
            ].map(([label, limit]) => (
              <span key={label} className={cn('rounded-full px-2 py-0.5', bytes2 <= (limit as number) ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-rose-500/15 text-rose-700 dark:text-rose-300')}>
                {label} {fmt(bytes2)}/{fmt(limit as number)}
              </span>
            ))}
          </div>
        </Readout>
      }
    />
  )
}

// --- Random picker ---------------------------------------------------------------------

const shuffle = <T,>(xs: readonly T[]): T[] => {
  const out = [...xs]
  for (let i = out.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export function PickerTool(): JSX.Element {
  const [text, setText] = usePersistentState('picker.names', '')
  const [mode, setMode] = usePersistentState<'pick' | 'order' | 'teams'>('picker.mode', 'order')
  const [count, setCount] = usePersistentState('picker.count', '2')
  const [result, setResult] = useState<string[][] | null>(null)
  const names = text.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)
  const k = Math.max(1, Math.trunc(num(count)) || 1)
  const run = (): void => {
    const s = shuffle(names)
    if (mode === 'pick') setResult([s.slice(0, k)])
    else if (mode === 'order') setResult([s])
    else setResult(Array.from({ length: Math.min(k, s.length) }, (_, t) => s.filter((_, i) => i % Math.min(k, s.length) === t)))
  }
  return (
    <ToolLayout
      inputs={
        <>
          <Segmented label="방식" value={mode} onChange={(m) => (setMode(m), setResult(null))} options={[['order', '순서 정하기'], ['pick', '뽑기'], ['teams', '팀 나누기']]} />
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-muted-foreground">후보 ({names.length}명) · 줄바꿈이나 쉼표로 구분</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={7}
              placeholder={'한 줄에 한 명씩, 또는 쉼표로 구분\n예: 김민준, 이서연, 박지호'}
              className="resize-y rounded-xl border border-input bg-background/80 px-3.5 py-2.5 text-[14px] outline-none transition-shadow placeholder:text-muted-foreground/45 focus:border-[color:var(--tool)] focus:shadow-[0_0_0_3px_var(--tool-soft)]"
            />
          </label>
          {mode !== 'order' && <Field label={mode === 'pick' ? '뽑을 수' : '팀 수'} value={count} onChange={setCount} suffix={mode === 'pick' ? '명' : '팀'} />}
          <Button onClick={run} disabled={names.length === 0} className="bg-[color:var(--tool)] text-white hover:opacity-90">
            <Shuffle className="h-4 w-4" /> {result ? '다시 섞기' : '섞기'}
          </Button>
        </>
      }
      readout={
        <section className="tool-plate rounded-[1.25rem] p-5">
          <span className="text-[12px] font-medium text-[color:var(--tool)]">결과</span>
          {!result ? (
            <p className="py-10 text-center text-[13px] text-muted-foreground">‘섞기’를 누르면 공정하게 무작위로 정합니다.</p>
          ) : (
            <div className={cn('mt-3 grid gap-3', result.length > 1 && 'sm:grid-cols-2')}>
              {result.map((group, g) => (
                <div key={g}>
                  {result.length > 1 && <p className="mb-1 text-[12px] font-medium text-muted-foreground">{g + 1}팀</p>}
                  <ol className="space-y-1">
                    {group.map((name, i) => (
                      <li key={name + i} className="flex animate-pop-in items-center gap-3 rounded-lg bg-background/60 px-3 py-2" style={{ animationDelay: `${(g * group.length + i) * 40}ms`, animationFillMode: 'backwards' }}>
                        {mode !== 'teams' && <span className="w-5 text-right text-[13px] font-semibold tabular-nums text-[color:var(--tool)]">{i + 1}</span>}
                        <span className="text-[15px] font-medium">{name}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          )}
        </section>
      }
    />
  )
}
