import { useEffect, useMemo, useState } from 'react'
import { Bell, CalendarDays, Flag, Repeat, X } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { fromDateInput, fromDateTimeInput, formatDue, PRIORITY_META, RECURRENCE_LABEL } from '@/lib/format'
import { parseQuickInput } from '@/lib/parseQuickInput'
import { cn } from '@/lib/utils'

export function QuickCapture(): JSX.Element {
  const open = useStore((s) => s.quickCaptureOpen)
  const close = useStore((s) => s.closeQuickCapture)
  const categories = useStore((s) => s.categories)
  const goals = useStore((s) => s.goals)
  const activeCategoryId = useStore((s) => s.activeCategoryId)
  const quickCaptureDate = useStore((s) => s.quickCaptureDate)
  const createTask = useStore((s) => s.createTask)

  const [title, setTitle] = useState('')
  const [categoryId, setCategoryId] = useState<string>('')
  const [goalId, setGoalId] = useState<string>('')
  const [dueDate, setDueDate] = useState<string>('')
  // The × on a recognised chip keeps the words literally in the title.
  const [literal, setLiteral] = useState(false)

  const parsed = useMemo(() => parseQuickInput(title), [title])
  const useParsed =
    !literal &&
    (parsed.due !== null || parsed.priority !== null || parsed.recurrence !== null || parsed.remindAt !== null)
  const effectiveDue = useParsed && parsed.due ? parsed.due : dueDate

  // Reset the form when the dialog opens, defaulting to the active category and
  // (when opened from the calendar) the clicked day.
  useEffect(() => {
    if (open) {
      setTitle('')
      setLiteral(false)
      setGoalId('')
      setCategoryId(activeCategoryId ?? categories[0]?.id ?? '')
      setDueDate(quickCaptureDate ?? '')
    }
  }, [open, activeCategoryId, categories, quickCaptureDate])

  const submit = async (): Promise<void> => {
    const trimmed = (useParsed ? parsed.title : title).trim()
    if (!trimmed || !categoryId) return
    await createTask({
      category_id: categoryId,
      title: trimmed,
      goal_id: goalId === '' ? null : goalId,
      due_date: fromDateInput(effectiveDue),
      ...(useParsed && parsed.priority !== null ? { priority: parsed.priority } : {}),
      ...(useParsed && parsed.recurrence ? { recurrence: parsed.recurrence } : {}),
      ...(useParsed && parsed.remindAt ? { remind_at: fromDateTimeInput(parsed.remindAt) } : {})
    })
    setTitle('')
    close()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : close())}>
      <DialogContent className="top-[28%] max-w-xl">
        <DialogHeader>
          <DialogTitle>빠른 작업 추가</DialogTitle>
        </DialogHeader>

        <input
          autoFocus
          value={title}
          placeholder="예: 내일까지 견적서 보내기 !!"
          aria-label="작업 제목"
          onChange={(e) => {
            setTitle(e.target.value)
            setLiteral(false)
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return // 한글 IME 조합 확정 Enter 무시 (중복 생성 방지)
            if (e.key === 'Enter') submit()
          }}
          className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base outline-none focus:ring-2 focus:ring-ring"
        />

        {useParsed ? (
          <div className="-mt-1 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">인식됨</span>
            {parsed.due && (
              <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
                <CalendarDays className="h-3 w-3" />
                {formatDue(fromDateInput(parsed.due))?.label}
              </span>
            )}
            {parsed.remindAt && (
              <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
                <Bell className="h-3 w-3" />
                {parsed.remindAt.slice(11)} 알림
              </span>
            )}
            {parsed.recurrence && (
              <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
                <Repeat className="h-3 w-3" />
                {RECURRENCE_LABEL[parsed.recurrence]}
              </span>
            )}
            {parsed.priority !== null && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium',
                  PRIORITY_META[parsed.priority].className
                )}
              >
                <Flag className="h-3 w-3" />
                {PRIORITY_META[parsed.priority].label}
              </span>
            )}
            <button
              onClick={() => setLiteral(true)}
              title="인식하지 않고 입력한 그대로 저장"
              aria-label="인식 취소"
              className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <p className="-mt-1 text-xs text-muted-foreground">
            ‘내일 오후 3시’, ‘금요일까지’, ‘10/3’ 같은 기한·알림, ‘매주’ 같은 반복, ‘!’~‘!!!’ 우선순위를 알아듣습니다.
          </p>
        )}

        <div className="flex items-center gap-2">
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            {categories.length === 0 && <option value="">카테고리 없음</option>}
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.parent_id ? '— ' : ''}
                {c.name}
              </option>
            ))}
          </select>

          <select
            value={goalId}
            onChange={(e) => setGoalId(e.target.value)}
            className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">목표 연결 없음</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            기한
            <input
              type="date"
              value={effectiveDue}
              disabled={useParsed && parsed.due !== null}
              onChange={(e) => setDueDate(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <Button onClick={submit} disabled={!title.trim() || !categoryId}>
            추가
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
