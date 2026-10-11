import { useMemo, useState, type CSSProperties } from 'react'
import { createReactBlockSpec } from '@blocknote/react'
import { Check, PencilLine } from 'lucide-react'
import { CHART_FENCE, computeReport, parseChartDoc, type ChartDoc } from '@shared/chart/kinds'
import { chartFenceBody } from '@shared/chart/html'
import { ChartView } from '../chart/ChartView'
import { ChartEditor } from '../chart/ChartEditor'
import { ChartFileButtons } from '../chart/ChartTool'
import { STATS_COLOR } from '../chart/kindIcons'

const VARS = { '--tool': STATS_COLOR, '--tool-soft': `${STATS_COLOR}14`, '--tool-line': `${STATS_COLOR}2e` } as CSSProperties

/**
 * A live 통계·그래프 chart inside a memo. Its whole state (ChartDoc) is the block's one
 * prop, so it saves, syncs and undoes with the memo; the Markdown copy is a fenced
 * ```aop-chart block holding the same JSON (search, vault, Claude Code, exports).
 */
export const createChart = createReactBlockSpec(
  { type: 'chart', propSchema: { doc: { default: '' } }, content: 'none' },
  {
    render: function ChartBlock({ block, editor }) {
      const doc = useMemo(() => parseChartDoc(block.props.doc), [block.props.doc])
      // A freshly inserted chart has no data yet: open straight into the editor.
      const [editing, setEditing] = useState(() => Boolean(doc && !computeReport(doc).svg))
      if (!doc) return <p className="bn-toc-empty">차트 데이터를 읽을 수 없습니다.</p>
      const update = (next: ChartDoc): void => {
        editor.updateBlock(block, { props: { doc: JSON.stringify(next) } })
      }
      return (
        <div className="bn-chart w-full" contentEditable={false} style={VARS} data-editing={editing || undefined}>
          <div className="bn-chart-bar">
            <button type="button" onClick={() => setEditing((v) => !v)} className={editing ? 'chart-primary chart-primary--sm' : 'chart-chip'}>
              {editing ? <Check className="h-3.5 w-3.5" /> : <PencilLine className="h-3.5 w-3.5" />}
              {editing ? '편집 완료' : '데이터 편집'}
            </button>
            <ChartFileButtons doc={doc} compact />
          </div>
          {editing ? (
            <div className="bn-chart-edit grid gap-5">
              <ChartEditor doc={doc} onChange={update} />
              <ChartView doc={doc} />
            </div>
          ) : (
            <div onDoubleClick={() => setEditing(true)} title="두 번 클릭해서 데이터 편집">
              <ChartView doc={doc} />
            </div>
          )}
        </div>
      )
    },
    toExternalHTML: ({ block }) => {
      const doc = parseChartDoc(block.props.doc)
      return (
        <pre>
          <code className={`language-${CHART_FENCE}`}>{doc ? chartFenceBody(doc) : ''}</code>
        </pre>
      )
    }
  }
)
