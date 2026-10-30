import { useEffect, useState } from 'react'
import { Home, Sun, Plus, CalendarDays, Search, NotebookPen, ListPlus, type LucideIcon } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { useToast } from '@/store/useToast'
import { useAppEvents } from '@/hooks/useAppEvents'
import { QuickCapture } from '@/components/QuickCapture'
import { Toast } from '@/components/Toast'
import { FilePreview } from '@/components/FilePreview'
import { DocumentViewer } from '@/components/DocumentViewer'
import { cn } from '@/lib/utils'
import { currentRoute, useNav, type Route, type Tab } from './nav'
import { HomeScreen } from './HomeScreen'
import { DeskScreen } from './DeskScreen'
import { CalendarScreen, MemoScreen, SearchScreen, TodayScreen, UtilityScreen } from './Screens'
import { Sheet, SheetAction } from './ui'
import './mobile.css'

const TAB_ROOTS: Record<Tab, () => JSX.Element> = {
  home: HomeScreen,
  today: TodayScreen,
  calendar: CalendarScreen,
  search: SearchScreen
}

function Screen({ tab, route }: { tab: Tab; route: Route }): JSX.Element {
  if (route.name === 'desk') return <DeskScreen id={route.id} />
  if (route.name === 'memo') return <MemoScreen id={route.id} workspaceId={route.workspaceId} />
  if (route.name === 'utility') return <UtilityScreen view={route.view} />
  const Root = TAB_ROOTS[tab]
  return <Root />
}

/**
 * Shared components open pages by setting store flags (openNote, navigateToTask, openUtility,
 * openPalette). On the phone each of those becomes a page pushed on the navigation stack.
 */
function useStoreNavigation(): void {
  useEffect(
    () =>
      useStore.subscribe((s, prev) => {
        const nav = useNav.getState()
        if (s.selectedNoteId && s.selectedNoteId !== prev.selectedNoteId) {
          nav.push({ name: 'memo', id: s.selectedNoteId, workspaceId: s.activeWorkspaceId })
          useStore.setState({ selectedNoteId: null })
        }
        if (s.expandedTaskId && s.expandedTaskId !== prev.expandedTaskId) {
          const smart = s.smartTasks.find((t) => t.id === s.expandedTaskId)
          nav.push({ name: 'memo', id: s.expandedTaskId, workspaceId: smart?.workspace_id ?? s.activeWorkspaceId })
          useStore.setState({ expandedTaskId: null, selectedTaskId: null })
        }
        if (s.utilityView && s.utilityView !== prev.utilityView) {
          if (s.utilityView === 'calendar') nav.setTab('calendar')
          else nav.push({ name: 'utility', view: s.utilityView })
          useStore.setState({ utilityView: null })
        }
        if (s.paletteOpen && !prev.paletteOpen) {
          nav.setTab('search')
          useStore.setState({ paletteOpen: false })
        }
      }),
    []
  )
}

/** Android back: close an open sheet/dialog first, then go back a page, then to the home tab. */
function useBackButton(): void {
  useEffect(() => {
    window.aopBack = () => {
      if (document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]')) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        return true
      }
      const nav = useNav.getState()
      if (nav.pop()) return true
      if (nav.tab !== 'home') {
        nav.setTab('home')
        return true
      }
      return false
    }
    return () => {
      window.aopBack = undefined
    }
  }, [])
}

/** The on-screen keyboard is up: the WebView resizes, so the visible height drops well below its largest. */
function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    // ponytail: max-height heuristic; a keyboard plugin's show/hide events if this misfires on rotation.
    let full = viewport.height
    const onResize = (): void => {
      full = Math.max(full, viewport.height)
      setOpen(viewport.height < full * KEYBOARD_SHARE)
    }
    const onRotate = (): void => {
      full = 0
    }
    viewport.addEventListener('resize', onResize)
    screen.orientation?.addEventListener('change', onRotate)
    return () => {
      viewport.removeEventListener('resize', onResize)
      screen.orientation?.removeEventListener('change', onRotate)
    }
  }, [])
  return open
}

/** Below this share of the full height, the difference is a keyboard (not a toolbar). */
const KEYBOARD_SHARE = 0.8

const TABS: { tab: Tab; label: string; icon: LucideIcon }[] = [
  { tab: 'home', label: '홈', icon: Home },
  { tab: 'today', label: '오늘', icon: Sun },
  { tab: 'calendar', label: '달력', icon: CalendarDays },
  { tab: 'search', label: '검색', icon: Search }
]

function TabBar({ onNew }: { onNew: () => void }): JSX.Element {
  const active = useNav((s) => s.tab)
  const setTab = useNav((s) => s.setTab)
  const button = ({ tab, label, icon: Icon }: (typeof TABS)[number]): JSX.Element => (
    <button
      key={tab}
      onClick={() => setTab(tab)}
      aria-current={active === tab ? 'page' : undefined}
      className={cn('flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px]', active === tab ? 'text-foreground' : 'text-muted-foreground')}
    >
      <Icon className="h-[22px] w-[22px]" strokeWidth={active === tab ? 2.3 : 1.8} />
      {label}
    </button>
  )
  return (
    <nav aria-label="탭" className="m-tabbar flex shrink-0 items-stretch border-t border-border/70 bg-background">
      {TABS.slice(0, 2).map(button)}
      <div className="flex flex-1 items-center justify-center">
        <button onClick={onNew} aria-label="새로 만들기" className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md active:scale-95">
          <Plus className="h-6 w-6" />
        </button>
      </div>
      {TABS.slice(2).map(button)}
    </nav>
  )
}

/** "+" in the tab bar: a new memo (opened right away) or a quick task in the open desk. */
function NewSheet({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  const createTask = useStore((s) => s.createTask)
  const openQuickCapture = useStore((s) => s.openQuickCapture)
  const push = useNav((s) => s.push)

  const target = (): { workspaceId: string; categoryId: string } | null => {
    const s = useStore.getState()
    const categoryId = s.activeCategoryId ?? s.categories[0]?.id
    if (!s.activeWorkspaceId || !categoryId) {
      useToast.getState().show({ message: '먼저 홈에서 데스크를 열고 카테고리를 만드세요.', tone: 'error' })
      return null
    }
    return { workspaceId: s.activeWorkspaceId, categoryId }
  }

  const newMemo = async (): Promise<void> => {
    onClose()
    const t = target()
    if (!t) return
    const task = await createTask({ category_id: t.categoryId, title: '제목 없음' })
    if (task) push({ name: 'memo', id: task.id, workspaceId: t.workspaceId })
  }

  const deskName = useStore((s) => s.workspaces.find((w) => w.id === s.activeWorkspaceId)?.name)
  return (
    <Sheet open={open} onClose={onClose} title={deskName ? `${deskName}에 추가` : '새로 만들기'}>
      <SheetAction icon={NotebookPen} label="새 메모" onClick={() => void newMemo()} />
      <SheetAction
        icon={ListPlus}
        label="빠른 작업 추가"
        onClick={() => {
          onClose()
          if (target()) openQuickCapture()
        }}
      />
    </Sheet>
  )
}

/** The phone app: tab bar + per-tab page stacks, on the same store and components as the desktop. */
export function MobileApp(): JSX.Element {
  useAppEvents()
  useStoreNavigation()
  useBackButton()
  const tab = useNav((s) => s.tab)
  const route = useNav(currentRoute)
  const openDocument = useStore((s) => s.openDocument)
  const closeDocument = useStore((s) => s.closeDocument)
  const [newOpen, setNewOpen] = useState(false)
  const keyboardOpen = useKeyboardOpen()
  const atRoot = route.name === 'tab'
  // Typing (search, quick add) gets the whole screen above the keyboard.
  const showTabBar = atRoot && !keyboardOpen

  return (
    <div className={cn('m-shell flex h-[100dvh] w-screen flex-col overflow-hidden bg-background text-foreground', atRoot && 'm-shell--tabs')}>
      <main key={`${tab}:${JSON.stringify(route)}`} className="min-h-0 flex-1 animate-in fade-in-0 duration-150">
        <Screen tab={tab} route={route} />
      </main>
      {showTabBar && <TabBar onNew={() => setNewOpen(true)} />}

      <NewSheet open={newOpen} onClose={() => setNewOpen(false)} />
      <QuickCapture />
      <Toast />
      <FilePreview />
      {openDocument && <DocumentViewer attachmentId={openDocument.id} fileName={openDocument.fileName} onClose={closeDocument} />}
    </div>
  )
}
