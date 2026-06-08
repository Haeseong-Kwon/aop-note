import { Notification, BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc'
import { taskRepo } from './repositories/task.repo'

// Tasks already notified this session — in-memory only (intentionally not a DB
// column; per the spec we avoid over-engineering and just dedupe per run).
const notified = new Set<string>()

function todayRange(): { start: string; end: string } {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  return { start: start.toISOString(), end: end.toISOString() }
}

function check(win: BrowserWindow): void {
  if (!Notification.isSupported()) return
  const { start, end } = todayRange()
  let due: ReturnType<typeof taskRepo.listDueBetween>
  try {
    due = taskRepo.listDueBetween(start, end)
  } catch (e) {
    console.error('[notifier] query failed:', e)
    return
  }

  for (const t of due) {
    if (notified.has(t.id)) continue
    notified.add(t.id)

    const n = new Notification({
      title: '오늘 마감 작업',
      body: `${t.title}\n${t.workspace_name} · ${t.category_name}`,
      silent: false
    })
    n.on('click', () => {
      if (win.isDestroyed()) return
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
      win.webContents.send(IPC.events.navigateToTask, {
        workspace_id: t.workspace_id,
        category_id: t.category_id,
        task_id: t.id
      })
    })
    n.show()
  }
}

/**
 * Notify about tasks due today: once on start, every 60s, and when the window
 * regains focus. Returns a stop() to clear the timer/listener.
 */
export function startDueNotifier(win: BrowserWindow): () => void {
  check(win)
  const interval = setInterval(() => check(win), 60_000)
  const onFocus = (): void => check(win)
  win.on('focus', onFocus)
  return () => {
    clearInterval(interval)
    if (!win.isDestroyed()) win.off('focus', onFocus)
  }
}
