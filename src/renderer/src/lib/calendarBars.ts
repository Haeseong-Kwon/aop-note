// Month view: items spanning days drawn as bars across a week row, stacked in lanes.

export interface DaySpan {
  id: string
  /** 'YYYY-MM-DD', inclusive. */
  startDay: string
  endDay: string
}

export interface WeekBar {
  id: string
  /** First column (0 = Sunday) and number of days in this week. */
  col: number
  span: number
  /** Stacking row inside the week (0 = top). */
  lane: number
  /** Started before / continues after this week (draw a squared-off edge). */
  continuesLeft: boolean
  continuesRight: boolean
}

/** Bars for one week (`days` = its 7 'YYYY-MM-DD' keys). Longer items get upper lanes;
 *  a lane is reused as soon as it's free, like Google Calendar. */
export function layoutWeek(days: readonly string[], items: readonly DaySpan[]): WeekBar[] {
  const first = days[0]
  const last = days[days.length - 1]
  const inWeek = items
    .filter((it) => it.startDay <= last && it.endDay >= first)
    .map((it) => {
      const from = it.startDay < first ? 0 : days.indexOf(it.startDay)
      const to = it.endDay > last ? days.length - 1 : days.indexOf(it.endDay)
      return { it, col: from, span: to - from + 1 }
    })
    .sort((a, b) => b.span - a.span || a.col - b.col || a.it.startDay.localeCompare(b.it.startDay))

  const lanes: boolean[][] = [] // lanes[lane][col] = taken
  return inWeek.map(({ it, col, span }) => {
    let lane = lanes.findIndex((row) => row.slice(col, col + span).every((taken) => !taken))
    if (lane < 0) {
      lanes.push(Array(days.length).fill(false))
      lane = lanes.length - 1
    }
    for (let c = col; c < col + span; c++) lanes[lane][c] = true
    return { id: it.id, col, span, lane, continuesLeft: it.startDay < first, continuesRight: it.endDay > last }
  })
}

/** 'YYYY-MM-DD' of a local date. */
export const dayKeyOf = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
