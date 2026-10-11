import { Eraser, Sparkles } from 'lucide-react'
import { emptyDoc, kindDef, sampleDoc, type ChartDoc } from '@shared/chart/kinds'
import { Field, Segmented } from '../tools/ui'
import { DataGrid } from './DataGrid'

const SECTION = 'flex flex-col gap-2'
const SECTION_LABEL = 'text-[12px] font-semibold text-foreground/80'

/** Everything that defines a chart: title, data, options, caption. Edits are whole new docs. */
export function ChartEditor({ doc, onChange }: { doc: ChartDoc; onChange: (doc: ChartDoc) => void }): JSX.Element {
  const def = kindDef(doc.kind)
  if (!def) return <p className="text-sm text-muted-foreground">알 수 없는 차트 종류입니다.</p>
  const setOpt = (key: string, value: string): void => onChange({ ...doc, opts: { ...doc.opts, [key]: value } })
  const choices = def.options.filter((o) => o.choices)
  const fields = def.options.filter((o) => !o.choices)
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={doc.title}
          onChange={(e) => onChange({ ...doc, title: e.target.value })}
          placeholder={`제목 (예: ${def.sample.title})`}
          aria-label="차트 제목"
          className="h-10 min-w-[14rem] flex-1 rounded-xl border border-input bg-background/80 px-3.5 text-[15px] font-semibold outline-none transition-[box-shadow,border-color] placeholder:font-normal placeholder:text-muted-foreground/45 focus:border-[color:var(--tool)] focus:shadow-[0_0_0_3px_var(--tool-soft)]"
        />
        <button type="button" onClick={() => onChange({ ...sampleDoc(doc.kind) })} className="chart-chip" title="이 도구의 예시 데이터로 채웁니다">
          <Sparkles className="h-3.5 w-3.5" /> 예시 데이터
        </button>
        <button type="button" onClick={() => onChange(emptyDoc(doc.kind))} className="chart-chip" title="입력을 모두 지웁니다">
          <Eraser className="h-3.5 w-3.5" /> 비우기
        </button>
      </div>

      {def.grid && (
        <section className={SECTION} aria-label="데이터">
          <span className={SECTION_LABEL}>데이터</span>
          <DataGrid grid={doc.grid.length ? doc.grid : emptyDoc(doc.kind).grid} shape={def.grid} onChange={(grid) => onChange({ ...doc, grid })} />
        </section>
      )}

      {(choices.length > 0 || fields.length > 0) && (
        <section className={SECTION} aria-label="설정">
          <span className={SECTION_LABEL}>{def.grid ? '표시 설정' : '입력값'}</span>
          {choices.map((o) => (
            <div key={o.key} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="w-24 shrink-0 text-[12px] text-muted-foreground">{o.label}</span>
              <div className="min-w-[12rem] flex-1">
                <Segmented label={o.label} value={doc.opts[o.key] ?? o.default} options={o.choices!} onChange={(v) => setOpt(o.key, v)} />
              </div>
            </div>
          ))}
          {fields.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {fields.map((o) => (
                <Field key={o.key} label={o.label} type={o.text ? 'text' : 'number'} value={doc.opts[o.key] ?? ''} onChange={(v) => setOpt(o.key, v)} suffix={o.suffix || undefined} placeholder={o.placeholder} />
              ))}
            </div>
          )}
        </section>
      )}

      <section className={SECTION} aria-label="설명">
        <span className={SECTION_LABEL}>설명 (선택)</span>
        <textarea
          value={doc.note}
          onChange={(e) => onChange({ ...doc, note: e.target.value })}
          rows={2}
          placeholder="출처, 기준일, 해석 메모 — 차트 아래에 함께 표시·내보내기됩니다"
          className="resize-y rounded-xl border border-input bg-background/80 px-3.5 py-2.5 text-[13px] outline-none placeholder:text-muted-foreground/45 focus:border-[color:var(--tool)] focus:shadow-[0_0_0_3px_var(--tool-soft)]"
        />
      </section>
    </div>
  )
}
