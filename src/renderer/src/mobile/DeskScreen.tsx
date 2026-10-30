import { useEffect, useMemo, useState } from 'react'
import { MoreHorizontal, Pencil, Plus, Trash2, FolderPlus, Eye, EyeOff } from 'lucide-react'
import { useStore, type MainView } from '@/store/useStore'
import { DeskIcon } from '@/components/DeskIcon'
import { DeskDatabase } from '@/components/DeskDatabase'
import { CalendarView } from '@/components/CalendarView'
import { GoalsView } from '@/components/GoalsView'
import { DocumentsView } from '@/components/DocumentsView'
import { flattenTree } from '@shared/tree'
import { Chips, IconButton, PromptSheet, Sheet, SheetAction, TopBar } from './ui'
import { useNav } from './nav'
import { TaskList, NoteList } from './DeskLists'
import type { Category } from '@shared/types'

const VIEWS: { value: MainView; label: string }[] = [
  { value: 'tasks', label: '작업' },
  { value: 'notes', label: '메모' },
  { value: 'database', label: '데이터베이스' },
  { value: 'calendar', label: '달력' },
  { value: 'goals', label: '목표' },
  { value: 'documents', label: '문서' }
]

type Prompt = { kind: 'desk-rename' } | { kind: 'category-new'; parentId: string | null } | { kind: 'category-rename'; category: Category }

/** One desk: its views as chips, then the chosen view full-screen. */
export function DeskScreen({ id }: { id: string }): JSX.Element {
  const desk = useStore((s) => s.workspaces.find((w) => w.id === id))
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId)
  const selectWorkspace = useStore((s) => s.selectWorkspace)
  const mainView = useStore((s) => s.mainView)
  const setMainView = useStore((s) => s.setMainView)
  const renameWorkspace = useStore((s) => s.renameWorkspace)
  const deleteWorkspace = useStore((s) => s.deleteWorkspace)
  const pop = useNav((s) => s.pop)
  const [menu, setMenu] = useState(false)
  const [prompt, setPrompt] = useState<Prompt | null>(null)

  // The store holds one open desk; coming back to this page re-opens this one.
  useEffect(() => {
    if (desk && activeWorkspaceId !== id) void selectWorkspace(id)
  }, [desk, id, activeWorkspaceId, selectWorkspace])

  // Moved to the trash (here or from another device): leave the page.
  useEffect(() => {
    if (!desk) pop()
  }, [desk, pop])

  const view = VIEWS.some((v) => v.value === mainView) ? mainView : 'tasks'
  const ready = activeWorkspaceId === id

  return (
    <div className="flex h-full flex-col">
      <TopBar
        back
        title={
          desk && (
            <>
              <DeskIcon color={desk.color} icon={desk.icon} size="md" />
              <span className="truncate">{desk.name}</span>
            </>
          )
        }
        actions={<IconButton icon={MoreHorizontal} label="데스크 메뉴" onClick={() => setMenu(true)} />}
      />
      <Chips items={VIEWS} value={view} onChange={setMainView} />

      <div className="min-h-0 flex-1 overflow-hidden border-t border-border/60">
        {ready && (view === 'tasks' || view === 'notes') && (
          <CategoryScope onPrompt={setPrompt}>{view === 'tasks' ? <TaskList /> : <NoteList />}</CategoryScope>
        )}
        {ready && view === 'database' && <DeskDatabase key={id} deskId={id} />}
        {ready && view === 'calendar' && <CalendarView />}
        {ready && view === 'goals' && <GoalsView />}
        {ready && view === 'documents' && <DocumentsView />}
      </div>

      <Sheet open={menu} onClose={() => setMenu(false)} title={desk?.name}>
        <SheetAction
          icon={Pencil}
          label="이름 바꾸기"
          onClick={() => {
            setPrompt({ kind: 'desk-rename' })
            setMenu(false)
          }}
        />
        <SheetAction
          icon={Trash2}
          label="휴지통으로 이동"
          danger
          onClick={() => {
            setMenu(false)
            void deleteWorkspace(id)
          }}
        />
      </Sheet>

      <DeskPrompts deskName={desk?.name ?? ''} prompt={prompt} onClose={() => setPrompt(null)} onRenameDesk={(n) => void renameWorkspace(id, n)} />
    </div>
  )
}

/** Category chips above the task/memo list, with add and a per-category menu. */
function CategoryScope({ children, onPrompt }: { children: JSX.Element; onPrompt: (p: Prompt) => void }): JSX.Element {
  const categories = useStore((s) => s.categories)
  const activeCategoryId = useStore((s) => s.activeCategoryId)
  const selectCategory = useStore((s) => s.selectCategory)
  const deleteCategory = useStore((s) => s.deleteCategory)
  const mainView = useStore((s) => s.mainView)
  const listPrefs = useStore((s) => s.listPrefs)
  const setListPrefs = useStore((s) => s.setListPrefs)
  const [menu, setMenu] = useState(false)

  const items = useMemo(
    () =>
      flattenTree(categories).map(({ item, depth }) => ({
        value: item.id,
        label: (
          <>
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
            {depth > 0 && <span className="text-muted-foreground">└</span>}
            {item.name}
          </>
        )
      })),
    [categories]
  )
  const active = categories.find((c) => c.id === activeCategoryId) ?? null

  if (categories.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
        <p className="text-[15px] text-muted-foreground">작업과 메모는 카테고리 안에 들어갑니다.</p>
        <button
          onClick={() => onPrompt({ kind: 'category-new', parentId: null })}
          className="h-11 rounded-xl bg-primary px-5 text-[15px] font-medium text-primary-foreground"
        >
          카테고리 만들기
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center border-b border-border/60">
        <div className="min-w-0 flex-1">
          <Chips
            items={items}
            value={activeCategoryId}
            onChange={selectCategory}
            trailing={
              <button
                onClick={() => onPrompt({ kind: 'category-new', parentId: null })}
                aria-label="새 카테고리"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground"
              >
                <Plus className="h-4 w-4" />
              </button>
            }
          />
        </div>
        <IconButton icon={MoreHorizontal} label="카테고리 메뉴" onClick={() => setMenu(true)} className="mr-1" />
      </div>

      <div className="min-h-0 flex-1">{children}</div>

      <Sheet open={menu} onClose={() => setMenu(false)} title={active?.name ?? '카테고리'}>
        {mainView === 'tasks' && (
          <SheetAction
            icon={listPrefs.hideDone ? Eye : EyeOff}
            label={listPrefs.hideDone ? '완료된 작업 보이기' : '완료된 작업 숨기기'}
            onClick={() => {
              setListPrefs({ hideDone: !listPrefs.hideDone })
              setMenu(false)
            }}
          />
        )}
        {active && (
          <>
            <SheetAction
              icon={FolderPlus}
              label="하위 카테고리 추가"
              onClick={() => {
                onPrompt({ kind: 'category-new', parentId: active.id })
                setMenu(false)
              }}
            />
            <SheetAction
              icon={Pencil}
              label="이름 바꾸기"
              onClick={() => {
                onPrompt({ kind: 'category-rename', category: active })
                setMenu(false)
              }}
            />
            <SheetAction
              icon={Trash2}
              label="휴지통으로 이동"
              danger
              onClick={() => {
                setMenu(false)
                void deleteCategory(active.id)
              }}
            />
          </>
        )}
      </Sheet>
    </div>
  )
}

function DeskPrompts({
  deskName,
  prompt,
  onClose,
  onRenameDesk
}: {
  deskName: string
  prompt: Prompt | null
  onClose: () => void
  onRenameDesk: (name: string) => void
}): JSX.Element {
  const createCategory = useStore((s) => s.createCategory)
  const updateCategory = useStore((s) => s.updateCategory)
  const selectCategory = useStore((s) => s.selectCategory)

  const addCategory = async (name: string, parentId: string | null): Promise<void> => {
    const before = new Set(useStore.getState().categories.map((c) => c.id))
    await createCategory({ name, parent_id: parentId })
    const created = useStore.getState().categories.find((c) => !before.has(c.id))
    if (created) selectCategory(created.id)
  }

  return (
    <>
      <PromptSheet
        open={prompt?.kind === 'desk-rename'}
        title="데스크 이름 바꾸기"
        placeholder="데스크 이름"
        initial={deskName}
        submitLabel="저장"
        onSubmit={onRenameDesk}
        onClose={onClose}
      />
      <PromptSheet
        open={prompt?.kind === 'category-new'}
        title={prompt?.kind === 'category-new' && prompt.parentId ? '하위 카테고리 만들기' : '새 카테고리'}
        placeholder="예: 기획, 회의록"
        submitLabel="만들기"
        onSubmit={(name) => void addCategory(name, prompt?.kind === 'category-new' ? prompt.parentId : null)}
        onClose={onClose}
      />
      <PromptSheet
        open={prompt?.kind === 'category-rename'}
        title="카테고리 이름 바꾸기"
        placeholder="카테고리 이름"
        initial={prompt?.kind === 'category-rename' ? prompt.category.name : ''}
        submitLabel="저장"
        onSubmit={(name) => prompt?.kind === 'category-rename' && void updateCategory({ id: prompt.category.id, name })}
        onClose={onClose}
      />
    </>
  )
}

