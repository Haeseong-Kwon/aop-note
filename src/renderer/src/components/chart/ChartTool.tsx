import { useState } from 'react'
import { FilePlus2, FileText, ImageDown, Presentation } from 'lucide-react'
import { emptyDoc, parseChartDoc, type ChartDoc, type ChartKind } from '@shared/chart/kinds'
import { usePersistentState } from '../tools/ui'
import { ChartEditor } from './ChartEditor'
import { ChartView } from './ChartView'
import { exportChartFile, saveChartAsMemo, type ChartFileFormat } from './chartActions'
import { cn } from '@/lib/utils'

const FILES: { fmt: ChartFileFormat; label: string; icon: typeof FileText }[] = [
  { fmt: 'pdf', label: 'PDF', icon: FileText },
  { fmt: 'pptx', label: 'PPTX', icon: Presentation },
  { fmt: 'png', label: 'PNG', icon: ImageDown }
]

/** PDF / PPTX / PNG buttons for one chart. */
export function ChartFileButtons({ doc, compact }: { doc: ChartDoc; compact?: boolean }): JSX.Element {
  const [busy, setBusy] = useState<ChartFileFormat | null>(null)
  const run = async (fmt: ChartFileFormat): Promise<void> => {
    setBusy(fmt)
    await exportChartFile(doc, fmt)
    setBusy(null)
  }
  return (
    <div role="group" aria-label="파일로 내보내기" className="chart-seg flex items-center">
      {FILES.map(({ fmt, label, icon: Icon }) => (
        <button key={fmt} type="button" disabled={busy !== null} onClick={() => void run(fmt)} title={`${label}로 내보내기`} className={cn('chart-seg-btn', compact && 'chart-seg-btn--compact')}>
          <Icon className="h-3.5 w-3.5" />
          {busy === fmt ? '…' : label}
        </button>
      ))}
    </div>
  )
}

/** A 통계·그래프 tool: editor on the left, the live chart on the right, save/export on top. */
export function ChartTool({ kind }: { kind: ChartKind }): JSX.Element {
  const [raw, setRaw] = usePersistentState<unknown>(`${kind}.doc`, null)
  const doc = parseChartDoc(raw) ?? emptyDoc(kind)
  const [saving, setSaving] = useState(false)
  const save = async (): Promise<void> => {
    setSaving(true)
    await saveChartAsMemo(doc)
    setSaving(false)
  }
  return (
    <div className="flex flex-col gap-5">
      <div className="chart-toolbar flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void save()} disabled={saving} className="chart-primary">
          <FilePlus2 className="h-4 w-4" /> {saving ? '저장 중…' : '메모로 저장'}
        </button>
        <ChartFileButtons doc={doc} />
        <span className="ml-auto text-[12px] text-muted-foreground">메모에서는 ‘/’ 메뉴의 통계·그래프로 바로 넣을 수 있습니다</span>
      </div>
      <div className="chart-tool-grid grid items-start gap-x-8 gap-y-6">
        <ChartEditor doc={doc} onChange={setRaw} />
        <ChartView doc={doc} />
      </div>
    </div>
  )
}
