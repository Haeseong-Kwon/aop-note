import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react'
import { Plus, X } from 'lucide-react'
import type { GridShape } from '@shared/chart/kinds'
import { cn } from '@/lib/utils'

const MAX_ROWS = 500
const DEFAULT_MAX_COLS = 12

/** Rows of cells from pasted text: Excel/Sheets give tabs; CSV-like text falls back to commas. */
export function parseClipboardTable(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n')
  const sep = lines.some((l) => l.includes('\t')) ? '\t' : lines.every((l) => l.includes(',') && !/\d,\d{3}/.test(l)) ? ',' : null
  return lines.map((l) => (sep ? l.split(sep) : [l]).map((c) => c.trim().replace(/^"(.*)"$/, '$1')))
}

/** Writes `block` into `grid` at (r, c), growing it within the shape's limits. Returns a new grid. */
export function pasteInto(grid: string[][], r: number, c: number, block: string[][], shape: GridShape): string[][] {
  const maxCols = shape.growCols ? shape.maxCols ?? DEFAULT_MAX_COLS : grid[0].length
  const maxRows = shape.growRows ? MAX_ROWS + 1 : grid.length
  const width = Math.min(maxCols, Math.max(grid[0].length, c + Math.max(...block.map((b) => b.length))))
  const height = Math.min(maxRows, Math.max(grid.length, r + block.length))
  return Array.from({ length: height }, (_, i) =>
    Array.from({ length: width }, (_, j) => {
      const inBlock = i >= r && j >= c ? block[i - r]?.[j - c] : undefined
      return inBlock ?? grid[i]?.[j] ?? ''
    })
  )
}

/**
 * A small spreadsheet: row 0 is the header (series / variable names), column 0 the row
 * labels when the shape has them. Paste a range from Excel anywhere; Enter moves down.
 */
export function DataGrid({ grid, shape, onChange }: { grid: string[][]; shape: GridShape; onChange: (g: string[][]) => void }): JSX.Element {
  const ref = useRef<HTMLTableElement>(null)
  const cols = grid[0]?.length ?? 0
  const maxCols = shape.maxCols ?? DEFAULT_MAX_COLS
  const fixedRow = (r: number): boolean => Boolean(shape.rowLabels) && r > 0
  const set = (r: number, c: number, v: string): void => onChange(grid.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)))
  const focus = (r: number, c: number): void => {
    requestAnimationFrame(() => ref.current?.querySelector<HTMLInputElement>(`[data-cell="${r}:${c}"]`)?.focus())
  }

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>, r: number, c: number): void => {
    const text = e.clipboardData.getData('text/plain')
    if (!/[\t\n,]/.test(text.trim())) return // a single value: let the input take it
    e.preventDefault()
    onChange(pasteInto(grid, r, c, parseClipboardTable(text), shape))
  }

  const handleKey = (e: KeyboardEvent<HTMLInputElement>, r: number, c: number): void => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter') {
      e.preventDefault()
      const next = r + (e.shiftKey ? -1 : 1)
      if (next < 0) return
      if (next >= grid.length) {
        if (!shape.growRows || grid.length > MAX_ROWS) return
        onChange([...grid, grid[0].map(() => '')])
      }
      focus(next, c)
    } else if (e.key === 'ArrowDown' && r + 1 < grid.length) {
      e.preventDefault()
      focus(r + 1, c)
    } else if (e.key === 'ArrowUp' && r > 0) {
      e.preventDefault()
      focus(r - 1, c)
    }
  }

  const removeRow = (r: number): void => onChange(grid.filter((_, i) => i !== r))
  const removeCol = (c: number): void => onChange(grid.map((row) => row.filter((_, j) => j !== c)))
  const addRow = (): void => onChange([...grid, grid[0].map(() => '')])
  const addCol = (): void => onChange(grid.map((row) => [...row, '']))
  const firstData = shape.labelCol ? 1 : 0
  const minCols = shape.labelCol ? 2 : 1

  return (
    <div className="chart-grid-wrap">
      <div className="overflow-x-auto rounded-xl border border-border">
        <table ref={ref} className="chart-grid w-full border-collapse text-[13px]">
          <tbody>
            {grid.map((row, r) => (
              <tr key={r} className={cn('group', r === 0 && 'chart-grid-head')}>
                {row.map((cell, c) => {
                  const label = shape.labelCol && c === 0
                  const readOnly = label && fixedRow(r)
                  const placeholder = r === 0 ? shape.head[c] ?? (c >= firstData ? `열 ${c + 1 - firstData}` : '') : label ? `항목 ${r}` : ''
                  return (
                    <td key={c} className={cn('relative', label && 'chart-grid-label')}>
                      <input
                        data-cell={`${r}:${c}`}
                        value={cell}
                        readOnly={readOnly}
                        placeholder={placeholder}
                        inputMode={r > 0 && !label ? 'decimal' : undefined}
                        aria-label={r === 0 ? `머리글 ${c + 1}` : `${r}행 ${c + 1}열`}
                        onChange={(e) => set(r, c, e.target.value)}
                        onPaste={(e) => handlePaste(e, r, c)}
                        onKeyDown={(e) => handleKey(e, r, c)}
                        className={cn('h-9 w-full min-w-[4.5rem] bg-transparent px-2.5 outline-none placeholder:text-muted-foreground/40', r > 0 && !label && 'text-right tabular-nums', r === 0 && 'font-semibold')}
                      />
                      {r === 0 && shape.growCols && cols > minCols && c >= firstData && (
                        <button type="button" onClick={() => removeCol(c)} aria-label={`${c + 1}열 삭제`} className="chart-grid-x absolute -top-px right-0.5">
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </td>
                  )
                })}
                {shape.growRows && (
                  <td className="chart-grid-gutter w-7">
                    {r > 0 && grid.length > 2 && (
                      <button type="button" onClick={() => removeRow(r)} aria-label={`${r}행 삭제`} className="chart-grid-x opacity-0 group-hover:opacity-100 focus-visible:opacity-100">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {shape.growRows && grid.length <= MAX_ROWS && (
          <button type="button" onClick={addRow} className="chart-grid-add">
            <Plus className="h-3.5 w-3.5" /> 행 추가
          </button>
        )}
        {shape.growCols && cols < maxCols && (
          <button type="button" onClick={addCol} className="chart-grid-add">
            <Plus className="h-3.5 w-3.5" /> 열 추가
          </button>
        )}
        <span className="ml-auto text-[11.5px] text-muted-foreground">{shape.hint} · 엑셀 범위를 붙여 넣을 수 있습니다</span>
      </div>
    </div>
  )
}
