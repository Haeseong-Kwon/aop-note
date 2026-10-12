import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react'
import { AlertTriangle, Plus, X } from 'lucide-react'
import type { GridShape } from '@shared/chart/kinds'
import { parseNum } from '@shared/chart/stats'
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

/** The role chip for column c ('항목', 'X 값', '계열'…): the shape's roles, last one repeating. */
export function columnRole(shape: GridShape, c: number): string {
  const roles = shape.roles ?? (shape.labelCol ? ['항목', '값'] : ['값'])
  return roles[Math.min(c, roles.length - 1)]
}

const isLabelCol = (shape: GridShape, c: number): boolean => shape.labelCol && c === 0
/** A filled data cell that isn't a number (it would be silently skipped). */
const isBadCell = (shape: GridShape, r: number, c: number, v: string): boolean => r > 0 && !isLabelCol(shape, c) && v.trim() !== '' && !Number.isFinite(parseNum(v))

/**
 * A small spreadsheet. Row 0 is the header (series / variable names) with each column's
 * meaning underneath; column 0 holds row labels when the shape has them. Paste a range
 * from Excel anywhere; Enter/arrows move between cells; non-numbers are flagged.
 */
export function DataGrid({ grid, shape, onChange }: { grid: string[][]; shape: GridShape; onChange: (g: string[][]) => void }): JSX.Element {
  const ref = useRef<HTMLTableElement>(null)
  const cols = grid[0]?.length ?? 0
  const maxCols = shape.maxCols ?? DEFAULT_MAX_COLS
  const firstData = shape.labelCol ? 1 : 0
  const minCols = shape.labelCol ? 2 : 1
  const set = (r: number, c: number, v: string): void => onChange(grid.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)))
  const focus = (r: number, c: number): void => {
    requestAnimationFrame(() => {
      const el = ref.current?.querySelector<HTMLInputElement>(`[data-cell="${r}:${c}"]`)
      el?.focus()
      el?.select()
    })
  }

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>, r: number, c: number): void => {
    const text = e.clipboardData.getData('text/plain')
    if (!/[\t\n,]/.test(text.trim())) return // a single value: let the input take it
    e.preventDefault()
    onChange(pasteInto(grid, r, c, parseClipboardTable(text), shape))
  }

  const handleKey = (e: KeyboardEvent<HTMLInputElement>, r: number, c: number): void => {
    if (e.nativeEvent.isComposing) return
    const el = e.currentTarget
    const atStart = el.selectionStart === 0 && el.selectionEnd === 0
    const atEnd = el.selectionStart === el.value.length
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
    } else if (e.key === 'ArrowLeft' && atStart && c > 0) {
      e.preventDefault()
      focus(r, c - 1)
    } else if (e.key === 'ArrowRight' && atEnd && c + 1 < cols) {
      e.preventDefault()
      focus(r, c + 1)
    }
  }

  const removeRow = (r: number): void => onChange(grid.filter((_, i) => i !== r))
  const removeCol = (c: number): void => onChange(grid.map((row) => row.filter((_, j) => j !== c)))
  const addRow = (): void => {
    onChange([...grid, grid[0].map(() => '')])
    focus(grid.length, 0)
  }
  const addCol = (): void => onChange(grid.map((row) => [...row, '']))

  const dataRows = grid.slice(1).filter((row) => row.some((v) => v.trim())).length
  const numbers = grid.slice(1).reduce((n, row) => n + row.filter((v, c) => !isLabelCol(shape, c) && Number.isFinite(parseNum(v))).length, 0)
  const bad = grid.reduce((n, row, r) => n + row.filter((v, c) => isBadCell(shape, r, c, v)).length, 0)

  return (
    <div className="chart-grid-wrap">
      <div className="overflow-x-auto rounded-xl border border-border bg-[hsl(var(--card))]">
        <table ref={ref} className="chart-grid w-full border-collapse text-[13px]">
          <thead>
            <tr className="chart-grid-head">
              <th className="chart-grid-num" aria-hidden />
              {grid[0].map((cell, c) => (
                <th key={c} className="relative p-0">
                  <input
                    data-cell={`0:${c}`}
                    value={cell}
                    placeholder={shape.head[c] ?? (c >= firstData ? `열 ${c + 1 - firstData}` : '')}
                    aria-label={`머리글 ${c + 1}`}
                    onChange={(e) => set(0, c, e.target.value)}
                    onPaste={(e) => handlePaste(e, 0, c)}
                    onKeyDown={(e) => handleKey(e, 0, c)}
                    className="h-9 w-full min-w-[4.5rem] bg-transparent px-2.5 font-semibold outline-none placeholder:font-medium placeholder:text-muted-foreground/45"
                  />
                  {shape.growCols && cols > minCols && c >= firstData && (
                    <button type="button" onClick={() => removeCol(c)} aria-label={`${c + 1}열 삭제`} title="이 열 삭제" className="chart-grid-x chart-grid-colx absolute right-1 top-1/2 -translate-y-1/2">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </th>
              ))}
              {shape.growRows && <th className="chart-grid-gutter" aria-hidden />}
            </tr>
            <tr className="chart-grid-roles" aria-hidden>
              <th className="chart-grid-num" />
              {grid[0].map((_, c) => (
                <th key={c}>
                  <span className={cn('chart-role', isLabelCol(shape, c) && 'chart-role--label')}>{columnRole(shape, c)}</span>
                </th>
              ))}
              {shape.growRows && <th className="chart-grid-gutter" />}
            </tr>
          </thead>
          <tbody>
            {grid.slice(1).map((row, i) => {
              const r = i + 1
              const fixedLabel = Boolean(shape.rowLabels)
              return (
                <tr key={r} className="group">
                  <td className="chart-grid-num">{r}</td>
                  {row.map((cell, c) => {
                    const label = isLabelCol(shape, c)
                    const badCell = isBadCell(shape, r, c, cell)
                    return (
                      <td key={c} className={cn(label && 'chart-grid-label', badCell && 'chart-grid-bad')} title={badCell ? '숫자가 아니어서 계산에서 빠집니다' : undefined}>
                        <input
                          data-cell={`${r}:${c}`}
                          value={cell}
                          readOnly={label && fixedLabel}
                          placeholder={label ? `항목 ${r}` : ''}
                          inputMode={label ? undefined : 'decimal'}
                          aria-label={`${r}행 ${c + 1}열`}
                          aria-invalid={badCell || undefined}
                          onChange={(e) => set(r, c, e.target.value)}
                          onPaste={(e) => handlePaste(e, r, c)}
                          onKeyDown={(e) => handleKey(e, r, c)}
                          onFocus={(e) => e.currentTarget.select()}
                          className={cn('h-9 w-full min-w-[4.5rem] bg-transparent px-2.5 outline-none placeholder:text-muted-foreground/35', !label && 'text-right tabular-nums')}
                        />
                      </td>
                    )
                  })}
                  {shape.growRows && (
                    <td className="chart-grid-gutter">
                      {grid.length > 2 && (
                        <button type="button" onClick={() => removeRow(r)} aria-label={`${r}행 삭제`} title="이 행 삭제" className="chart-grid-x opacity-0 group-hover:opacity-100 focus-visible:opacity-100">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
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
        <span className="ml-auto flex items-center gap-2 text-[11.5px] tabular-nums text-muted-foreground">
          {bad > 0 && (
            <span className="flex items-center gap-1 font-medium text-rose-600 dark:text-rose-400">
              <AlertTriangle className="h-3 w-3" /> 숫자가 아닌 칸 {bad}개
            </span>
          )}
          <span>
            {dataRows}행 · 숫자 {numbers}개
          </span>
        </span>
      </div>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
        {shape.hint}. <kbd className="chart-kbd">⌘V</kbd> 엑셀·시트 범위 붙여넣기 · <kbd className="chart-kbd">Enter</kbd> 아래 칸 · <kbd className="chart-kbd">Tab</kbd> 옆 칸 · ‘1500만’처럼 단위로 써도 됩니다
      </p>
    </div>
  )
}
