import { useRef, useState, type ReactNode } from 'react'
import { Eraser, FileUp, Plus, Sparkles } from 'lucide-react'
import { emptyDoc, kindDef, sampleDoc, type ChartDoc, type OptionDef } from '@shared/chart/kinds'
import { toastError } from '@/store/useToast'
import { Field, Segmented, focusNextOnEnter } from '../tools/ui'
import { DataGrid, parseClipboardTable, pasteInto } from './DataGrid'

const MAX_IMPORT_BYTES = 2 * 1024 * 1024

/** A numbered step of the editor: ① 데이터 ② 표시 설정 ③ 설명. */
function Step({ n, title, actions, children }: { n: number; title: string; actions?: ReactNode; children: ReactNode }): JSX.Element {
  return (
    <section aria-label={title} className="flex min-w-0 flex-col gap-3">
      <header className="flex flex-wrap items-center gap-2">
        <span className="chart-step-n" aria-hidden>
          {n}
        </span>
        <h3 className="text-[13.5px] font-semibold tracking-[-0.01em]">{title}</h3>
        {actions && <div className="ml-auto flex flex-wrap items-center gap-1.5">{actions}</div>}
      </header>
      {children}
    </section>
  )
}

function OptionControls({ choices, fields, doc, setOpt }: { choices: OptionDef[]; fields: OptionDef[]; doc: ChartDoc; setOpt: (key: string, value: string) => void }): JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      {choices.map((o) => (
        <div key={o.key} className="chart-opt-row">
          <span className="text-[12px] font-medium text-muted-foreground">{o.label}</span>
          <Segmented hideLabel label={o.label} value={doc.opts[o.key] ?? o.default} options={o.choices!} onChange={(v) => setOpt(o.key, v)} />
        </div>
      ))}
      {fields.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3">
          {fields.map((o) => (
            <Field key={o.key} label={o.label} type={o.text ? 'text' : 'number'} value={doc.opts[o.key] ?? ''} onChange={(v) => setOpt(o.key, v)} suffix={o.suffix || undefined} placeholder={o.placeholder} />
          ))}
        </div>
      )}
    </div>
  )
}

/** Everything that defines a chart: title, data, options, caption. Edits are whole new docs. */
export function ChartEditor({ doc, onChange }: { doc: ChartDoc; onChange: (doc: ChartDoc) => void }): JSX.Element {
  const fileRef = useRef<HTMLInputElement>(null)
  const [noteOpen, setNoteOpen] = useState(Boolean(doc.note.trim()))
  const def = kindDef(doc.kind)
  if (!def) return <p className="text-sm text-muted-foreground">알 수 없는 차트 종류입니다.</p>
  const setOpt = (key: string, value: string): void => onChange({ ...doc, opts: { ...doc.opts, [key]: value } })
  const choices = def.options.filter((o) => o.choices)
  const fields = def.options.filter((o) => !o.choices)
  const grid = doc.grid.length ? doc.grid : emptyDoc(doc.kind).grid
  const shape = def.grid

  /** A .csv / .tsv file replaces the table (header row first, like a pasted range). */
  const importFile = async (file: File | undefined): Promise<void> => {
    if (!file || !shape) return
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new Error('파일이 너무 큽니다 (2MB 이하의 CSV만 가져올 수 있습니다).')
      const rows = parseClipboardTable(await file.text())
      if (!rows.length || !rows[0].length) throw new Error('파일에서 표를 찾지 못했습니다.')
      const blank = emptyDoc(doc.kind).grid.slice(0, 2).map((r) => r.map(() => ''))
      onChange({ ...doc, grid: pasteInto(blank, 0, 0, rows, shape) })
    } catch (error) {
      toastError(error)
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const sample = (
    <button type="button" onClick={() => onChange({ ...sampleDoc(doc.kind) })} className="chart-chip" title="이 도구의 예시 데이터로 채웁니다">
      <Sparkles className="h-3.5 w-3.5" /> 예시
    </button>
  )
  let step = 0
  return (
    <div className="chart-editor flex min-w-0 flex-col gap-6" onKeyDown={focusNextOnEnter}>
      <label className="flex flex-col gap-1">
        <span className="text-[11.5px] font-medium text-muted-foreground">제목</span>
        <input value={doc.title} onChange={(e) => onChange({ ...doc, title: e.target.value })} placeholder={def.sample.title} aria-label="차트 제목" className="chart-title-input" />
      </label>

      {shape ? (
        <Step
          n={++step}
          title="데이터"
          actions={
            <>
              {sample}
              <button type="button" onClick={() => fileRef.current?.click()} className="chart-chip" title="CSV·TSV 파일의 표를 가져옵니다 (첫 줄은 머리글)">
                <FileUp className="h-3.5 w-3.5" /> CSV 가져오기
              </button>
              <button type="button" onClick={() => onChange({ ...emptyDoc(doc.kind), title: doc.title, note: doc.note, opts: doc.opts })} className="chart-chip" title="표의 값을 모두 지웁니다 (제목·설정은 유지)">
                <Eraser className="h-3.5 w-3.5" /> 표 비우기
              </button>
              <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" hidden onChange={(e) => void importFile(e.target.files?.[0])} />
            </>
          }
        >
          <DataGrid grid={grid} shape={shape} onChange={(g) => onChange({ ...doc, grid: g })} />
        </Step>
      ) : (
        <Step n={++step} title="입력값" actions={sample}>
          <OptionControls choices={choices} fields={fields} doc={doc} setOpt={setOpt} />
        </Step>
      )}

      {shape && (choices.length > 0 || fields.length > 0) && (
        <Step n={++step} title="표시 설정">
          <OptionControls choices={choices} fields={fields} doc={doc} setOpt={setOpt} />
        </Step>
      )}

      {noteOpen ? (
        <Step n={++step} title="설명">
          <textarea
            value={doc.note}
            onChange={(e) => onChange({ ...doc, note: e.target.value })}
            rows={2}
            autoFocus={!doc.note}
            placeholder="출처, 기준일, 해석 메모 — 차트 아래에 함께 표시되고 PDF·PPTX에도 들어갑니다"
            className="tool-field min-h-[4.5rem] resize-y rounded-xl px-3.5 py-2.5 text-[13px] outline-none placeholder:text-muted-foreground/45"
          />
        </Step>
      ) : (
        <button type="button" onClick={() => setNoteOpen(true)} className="chart-grid-add self-start">
          <Plus className="h-3.5 w-3.5" /> 설명 추가 (출처·기준일)
        </button>
      )}
    </div>
  )
}
