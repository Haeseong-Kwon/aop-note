import { useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { entropyBits, makePassword } from '@/lib/toolMath'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { CopyButton, Note, Plate, Segmented, ToolLayout, usePersistentState } from './ui'

type Sort = 'none' | 'asc' | 'desc'
type Join = 'lines' | 'comma' | 'tab'

interface CleanOptions {
  trim: boolean
  dropEmpty: boolean
  dedupe: boolean
  number: boolean
}

const OPTION_LABELS: [keyof CleanOptions, string][] = [
  ['trim', '앞뒤 공백 제거'],
  ['dropEmpty', '빈 줄 제거'],
  ['dedupe', '중복 제거'],
  ['number', '번호 매기기']
]

export function ListCleanTool(): JSX.Element {
  const [text, setText] = usePersistentState('list-clean.text', '')
  const [opts, setOpts] = usePersistentState<CleanOptions>('list-clean.opts', { trim: true, dropEmpty: true, dedupe: true, number: false })
  const [sort, setSort] = usePersistentState<Sort>('list-clean.sort', 'none')
  const [join, setJoin] = usePersistentState<Join>('list-clean.join', 'lines')
  // Comma- or tab-separated input is split too, so a pasted row becomes a list.
  let items = text.split(/\r?\n|\t|,(?=\s*\S)/)
  if (opts.trim) items = items.map((s) => s.trim())
  if (opts.dropEmpty) items = items.filter((s) => s.trim() !== '')
  const before = items.length
  if (opts.dedupe) items = [...new Set(items)]
  const removed = before - items.length
  if (sort !== 'none') items = [...items].sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }) * (sort === 'asc' ? 1 : -1))
  if (opts.number) items = items.map((s, i) => `${i + 1}. ${s}`)
  const out = items.join(join === 'lines' ? '\n' : join === 'comma' ? ', ' : '\t')
  return (
    <ToolLayout
      inputs={
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'정리할 목록을 붙여 넣으세요.\n엑셀 열, 이메일 목록, 쉼표로 이은 이름 모두 됩니다.'}
            aria-label="원본 목록"
            className="min-h-[14rem] resize-y rounded-xl tool-field p-4 text-[14px] leading-relaxed outline-none transition-shadow placeholder:text-muted-foreground/45 focus:border-[color:var(--tool)] focus:shadow-[0_0_0_3px_var(--tool-soft)]"
          />
          <div className="flex flex-wrap gap-1.5">
            {OPTION_LABELS.map(([key, label]) => (
              <button
                key={key}
                role="switch"
                aria-checked={opts[key]}
                onClick={() => setOpts({ ...opts, [key]: !opts[key] })}
                className={cn(
                  'h-8 rounded-full border px-3 text-[12.5px] transition-colors',
                  opts[key] ? 'border-transparent bg-[color:var(--tool-soft)] font-medium text-[color:var(--tool)]' : 'border-border text-muted-foreground hover:text-foreground'
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <Segmented label="정렬" value={sort} onChange={setSort} options={[['none', '원래 순서'], ['asc', '가나다순'], ['desc', '역순']]} />
          <Segmented label="결과 구분" value={join} onChange={setJoin} options={[['lines', '줄바꿈'], ['comma', '쉼표'], ['tab', '탭 (엑셀 가로)']]} />
        </>
      }
      readout={
        <Plate label={`결과 ${items.length}개${removed ? ` · 중복 ${removed}개 제거` : ''}`} action={out ? <CopyButton text={out} /> : undefined}>
          {out ? (
            <pre className="max-h-[26rem] overflow-auto whitespace-pre-wrap break-all rounded-xl bg-background/70 p-3 font-sans text-[13.5px] leading-relaxed">{out}</pre>
          ) : (
            <p className="py-8 text-center text-[13px] text-muted-foreground">왼쪽에 목록을 붙여 넣으면 정리된 결과가 나옵니다.</p>
          )}
        </Plate>
      }
    />
  )
}

const cryptoInt = (n: number): number => {
  // Rejection sampling avoids modulo bias.
  const limit = Math.floor(0x1_0000_0000 / n) * n
  for (;;) {
    const x = crypto.getRandomValues(new Uint32Array(1))[0]
    if (x < limit) return x % n
  }
}

export function PasswordTool(): JSX.Element {
  const [length, setLength] = usePersistentState('password.length', 16)
  const [sets, setSets] = usePersistentState('password.sets', { upper: true, digits: true, symbols: true })
  const [avoid, setAvoid] = usePersistentState('password.avoid', true)
  const [seed, setSeed] = useState(0)
  // Never saved: regenerated on every visit, option change or 다시 만들기 (seed).
  const items = useMemo(() => Array.from({ length: 5 }, () => makePassword(length, sets, avoid, cryptoInt)), [length, sets, avoid, seed]) // eslint-disable-line react-hooks/exhaustive-deps -- seed only forces a new batch
  const pool = 26 + (sets.upper ? 26 : 0) + (sets.digits ? 10 : 0) + (sets.symbols ? 13 : 0) - (avoid ? 8 : 0)
  const bits = entropyBits(length, pool)
  const strength = bits >= 100 ? ['매우 강함', 'bg-emerald-500', 1] : bits >= 75 ? ['강함', 'bg-emerald-500', 0.75] : bits >= 50 ? ['보통', 'bg-amber-500', 0.5] : ['약함', 'bg-rose-500', 0.25]
  const toggle = (k: keyof typeof sets): void => setSets({ ...sets, [k]: !sets[k] })
  return (
    <ToolLayout
      inputs={
        <>
          <label className="flex flex-col gap-2">
            <span className="flex justify-between text-[12px] font-medium text-muted-foreground">
              <span>길이</span>
              <span className="tabular-nums text-foreground">{length}자</span>
            </span>
            <input type="range" min={8} max={48} value={length} onChange={(e) => setLength(Number(e.target.value))} className="accent-[color:var(--tool)]" />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['upper', '대문자 A-Z'],
                ['digits', '숫자 0-9'],
                ['symbols', '기호 !@#']
              ] as const
            ).map(([k, label]) => (
              <button key={k} role="switch" aria-checked={sets[k]} onClick={() => toggle(k)} className={cn('h-8 rounded-full border px-3 text-[12.5px] transition-colors', sets[k] ? 'border-transparent bg-[color:var(--tool-soft)] font-medium text-[color:var(--tool)]' : 'border-border text-muted-foreground hover:text-foreground')}>
                {label}
              </button>
            ))}
            <button role="switch" aria-checked={avoid} onClick={() => setAvoid(!avoid)} className={cn('h-8 rounded-full border px-3 text-[12.5px] transition-colors', avoid ? 'border-transparent bg-[color:var(--tool-soft)] font-medium text-[color:var(--tool)]' : 'border-border text-muted-foreground hover:text-foreground')}>
              헷갈리는 글자 빼기 (l, 1, O, 0)
            </button>
          </div>
          <Note>브라우저의 암호학적 난수로 이 기기에서만 만듭니다. 만든 비밀번호는 저장하지 않습니다.</Note>
        </>
      }
      readout={
        <Plate
          label="새 비밀번호"
          action={
            <Button size="sm" variant="ghost" onClick={() => setSeed(seed + 1)} className="h-7 gap-1 px-2 text-[12px]">
              <RefreshCw className="h-3.5 w-3.5" /> 다시 만들기
            </Button>
          }
        >
          <ul className="space-y-1.5">
            {items.map((p, i) => (
              <li key={p} className={cn('flex items-center gap-2 rounded-xl bg-background/70 px-3', i === 0 ? 'py-3' : 'py-2')}>
                <code className={cn('min-w-0 flex-1 break-all font-mono tracking-wide', i === 0 ? 'text-[17px] font-semibold' : 'text-[13px] text-foreground/80')}>{p}</code>
                <CopyButton text={p} label="비밀번호 복사" />
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center gap-3 text-[12px]">
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <span className={cn('block h-full rounded-full transition-[width] duration-slow', strength[1] as string)} style={{ width: `${(strength[2] as number) * 100}%` }} />
            </span>
            <span className="font-medium">{strength[0] as string}</span>
            <span className="tabular-nums text-muted-foreground">약 {Math.round(bits)}비트</span>
          </div>
        </Plate>
      }
    />
  )
}
