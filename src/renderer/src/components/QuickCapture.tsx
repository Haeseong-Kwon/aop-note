import { useEffect, useState } from 'react'
import { useStore } from '@/store/useStore'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export function QuickCapture(): JSX.Element {
  const open = useStore((s) => s.quickCaptureOpen)
  const close = useStore((s) => s.closeQuickCapture)
  const categories = useStore((s) => s.categories)
  const goals = useStore((s) => s.goals)
  const activeCategoryId = useStore((s) => s.activeCategoryId)
  const createTask = useStore((s) => s.createTask)

  const [title, setTitle] = useState('')
  const [categoryId, setCategoryId] = useState<string>('')
  const [goalId, setGoalId] = useState<string>('')

  // Reset the form when the dialog opens, defaulting to the active category.
  useEffect(() => {
    if (open) {
      setTitle('')
      setGoalId('')
      setCategoryId(activeCategoryId ?? categories[0]?.id ?? '')
    }
  }, [open, activeCategoryId, categories])

  const submit = async (): Promise<void> => {
    const trimmed = title.trim()
    if (!trimmed || !categoryId) return
    await createTask({
      category_id: categoryId,
      title: trimmed,
      goal_id: goalId === '' ? null : goalId
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
          placeholder="무엇을 해야 하나요? (Enter로 저장)"
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
          className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base outline-none focus:ring-2 focus:ring-ring"
        />

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

          <Button onClick={submit} disabled={!title.trim() || !categoryId}>
            추가
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
