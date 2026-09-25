import { Notification, BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc'
import { taskRepo } from './repositories/task.repo'
import { loadSettings } from './settings'
import type { TaskWithContext } from '@shared/types'

// Tasks already notified this session — in-memory only (intentionally not a DB
// column; per the spec we avoid over-engineering and just dedupe per run).
const notified = new Set<string>()

function todayRange(): { start: string; end: string } {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  return { start: start.toISOString(), end: end.toISOString() }
}

function notify(win: BrowserWindow, title: string, t: TaskWithContext): void {
  const n = new Notification({
    title,
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

function check(win: BrowserWindow): void {
  if (!Notification.isSupported()) return
  try {
    // Timed reminders: persisted as fired, so a restart doesn't repeat them.
    for (const t of taskRepo.listRemindersDue(new Date().toISOString())) {
      taskRepo.markReminded(t.id)
      notify(win, '알림', t)
    }

    if (!loadSettings().dueNotifications) return
    const { start, end } = todayRange()
    for (const t of taskRepo.listDueBetween(start, end)) {
      if (notified.has(t.id)) continue
      notified.add(t.id)
      notify(win, '오늘 마감 작업', t)
    }
  } catch (e) {
    console.error('[notifier] check failed:', e)
  }
}

/**
 * Fire due reminders and notify about tasks due today: once on start, every 60s,
 * and when the window regains focus. Returns a stop() to clear the timer/listener.
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
