import { useMemo } from 'react'
import DOMPurify from 'dompurify'
import { BarChart3, Lightbulb } from 'lucide-react'
import { computeReport, kindDef, type ChartDoc } from '@shared/chart/kinds'
import { useIsDark } from '@/hooks/useMemoPersist'
import { cn } from '@/lib/utils'

/** The finished chart: title, picture, the one-line reading, figures and detail table. */
export function ChartView({ doc, showTitle = true, className }: { doc: ChartDoc; showTitle?: boolean; className?: string }): JSX.Element {
  const dark = useIsDark()
  const report = useMemo(() => computeReport(doc, dark ? 'dark' : 'light'), [doc, dark])
  // Built from escaped values already; sanitised again because it is injected as markup.
  const svg = useMemo(() => (report.svg ? DOMPurify.sanitize(report.svg, { USE_PROFILES: { svg: true, svgFilters: false } }) : ''), [report.svg])
  const def = kindDef(doc.kind)
  const title = doc.title.trim() || def?.name || '차트'
  return (
    <figure className={cn('chart-card m-0 min-w-0 rounded-2xl p-5', className)} data-chart-kind={doc.kind}>
      {showTitle && (
        <figcaption className="mb-3 flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate text-[15px] font-semibold tracking-[-0.015em]">{title}</span>
          <span className="shrink-0 text-[11px] font-medium text-muted-foreground">{def?.name}</span>
        </figcaption>
      )}
      {svg ? (
        <div className="chart-svg" role="img" aria-label={`${title} — ${report.insight}`} dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div className="chart-empty flex aspect-[16/9] flex-col items-center justify-center gap-2 rounded-xl text-center">
          <BarChart3 className="h-7 w-7 text-muted-foreground/35" />
          <p className="max-w-[18rem] text-[13px] text-muted-foreground">{report.empty}</p>
        </div>
      )}
      {report.insight && (
        <p className="chart-insight mt-4 flex gap-2 rounded-xl px-3.5 py-2.5 text-[13.5px] leading-relaxed">
          <Lightbulb className="mt-[3px] h-3.5 w-3.5 shrink-0 text-[color:var(--tool)]" />
          <span>{report.insight}</span>
        </p>
      )}
      {report.stats.length > 0 && (
        <dl className="chart-stats mt-3 grid gap-px overflow-hidden rounded-xl">
          {report.stats.map((s) => (
            <div key={s.label} className="flex min-w-0 flex-col gap-0.5 px-3 py-2">
              <dt className="truncate text-[11.5px] text-muted-foreground" title={s.label}>
                {s.label}
              </dt>
              <dd className={cn('m-0 break-words text-[13.5px] tabular-nums', s.strong && 'font-semibold')}>{s.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {report.table && (
        <div className="mt-3 overflow-x-auto">
          <table className="chart-table w-full text-[12.5px] tabular-nums">
            <thead>
              <tr>
                {report.table.head.map((h, i) => (
                  <th key={i} className={i ? 'text-right' : 'text-left'}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j} className={j ? 'text-right' : 'text-left text-muted-foreground'}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {doc.note.trim() && <p className="mt-3 whitespace-pre-wrap text-[12.5px] text-muted-foreground">{doc.note}</p>}
    </figure>
  )
}
