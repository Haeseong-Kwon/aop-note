import { useEffect, useState } from 'react'
import {
  ChevronRight,
  MoreHorizontal,
  Plus,
  Settings,
  Sparkles,
  Waypoints,
  Wrench,
  Trash2,
  Pencil,
  FolderPlus,
  Sun,
  Moon,
  MonitorSmartphone,
  Monitor
} from 'lucide-react'
import { useStore, type Theme } from '@/store/useStore'
import { flattenTree } from '@shared/tree'
import { DeskIcon } from '@/components/DeskIcon'
import { cn } from '@/lib/utils'
import { useNav } from './nav'
import { IconButton, PromptSheet, Row, SectionLabel, Sheet, SheetAction } from './ui'
import { formatRelative } from '@/lib/format'
import type { PcLinkStatus, Workspace } from '@shared/types'

const THEMES: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: '라이트', icon: Sun },
  { value: 'dark', label: '다크', icon: Moon },
  { value: 'system', label: '시스템', icon: MonitorSmartphone }
]

/** Home tab: every desk as a tree, then the app-wide pages. */
export function HomeScreen(): JSX.Element {
  const workspaces = useStore((s) => s.workspaces)
  const loading = useStore((s) => s.loading)
  const createWorkspace = useStore((s) => s.createWorkspace)
  const renameWorkspace = useStore((s) => s.renameWorkspace)
  const deleteWorkspace = useStore((s) => s.deleteWorkspace)
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  const push = useNav((s) => s.push)

  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const [menuFor, setMenuFor] = useState<Workspace | null>(null)
  // null parent = new top-level desk
  const [creating, setCreating] = useState<{ parentId: string | null } | null>(null)
  const [renaming, setRenaming] = useState<Workspace | null>(null)

  const rows = flattenTree(workspaces, collapsed)
  const toggle = (id: string): void =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })

  const create = async (name: string): Promise<void> => {
    const parentId = creating?.parentId ?? null
    await createWorkspace(name, parentId)
    const id = useStore.getState().activeWorkspaceId
    if (id) push({ name: 'desk', id })
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-16 shrink-0 items-center justify-between px-4 pt-2">
        <div className="flex items-center gap-2.5">
          <img src="./app-icon.png" alt="" className="h-8 w-8 rounded-[9px] ring-1 ring-black/10 dark:ring-white/10" />
          <h1 className="text-[26px] font-bold tracking-tight">AOP Note</h1>
        </div>
        <IconButton icon={Settings} label="설정" onClick={() => push({ name: 'utility', view: 'settings' })} />
      </header>

      <div className="flex-1 overflow-y-auto pb-6">
        <SectionLabel
          action={
            <button
              onClick={() => setCreating({ parentId: null })}
              aria-label="새 데스크"
              className="-mr-2 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground active:bg-accent"
            >
              <Plus className="h-[18px] w-[18px]" />
            </button>
          }
        >
          데스크
        </SectionLabel>

        {!loading && workspaces.length === 0 && (
          <button
            onClick={() => setCreating({ parentId: null })}
            className="mx-4 mt-1 flex w-[calc(100%-2rem)] flex-col items-start gap-1 rounded-2xl border border-dashed border-border px-5 py-5 text-left active:bg-accent"
          >
            <span className="text-[16px] font-semibold">첫 데스크 만들기</span>
            <span className="text-[14px] text-muted-foreground">프로젝트나 업무 영역 하나가 데스크 하나입니다.</span>
          </button>
        )}

        {rows.map(({ item: desk, depth, hasChildren }) => (
          <Row
            key={desk.id}
            indent={depth}
            onClick={() => push({ name: 'desk', id: desk.id })}
            icon={<DeskIcon color={desk.color} icon={desk.icon} size="md" />}
            label={desk.name}
            trailing={
              <>
                {hasChildren && (
                  <button
                    onClick={() => toggle(desk.id)}
                    aria-label={collapsed.has(desk.id) ? '하위 데스크 펼치기' : '하위 데스크 접기'}
                    className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground active:bg-accent"
                  >
                    <ChevronRight className={cn('h-4 w-4 transition-transform', !collapsed.has(desk.id) && 'rotate-90')} />
                  </button>
                )}
                <button
                  onClick={() => setMenuFor(desk)}
                  aria-label={`${desk.name} 메뉴`}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground active:bg-accent"
                >
                  <MoreHorizontal className="h-[18px] w-[18px]" />
                </button>
              </>
            }
          />
        ))}

        <SectionLabel>도구</SectionLabel>
        <PcLinkRow onOpen={() => push({ name: 'utility', view: 'settings' })} />
        <Row icon={<Sparkles className="h-5 w-5" />} label="AI에게 묻기" detail="내 메모를 근거로 답합니다" onClick={() => push({ name: 'utility', view: 'ask' })} />
        <Row icon={<Waypoints className="h-5 w-5" />} label="그래프" onClick={() => push({ name: 'utility', view: 'graph' })} />
        <Row icon={<Wrench className="h-5 w-5" />} label="계산·변환 도구" onClick={() => push({ name: 'utility', view: 'tools' })} />
        <Row icon={<Trash2 className="h-5 w-5" />} label="휴지통" onClick={() => push({ name: 'utility', view: 'trash' })} />

        <SectionLabel>화면 모드</SectionLabel>
        <div className="mx-4 flex rounded-xl bg-muted p-1">
          {THEMES.map((t) => (
            <button
              key={t.value}
              onClick={() => setTheme(t.value)}
              aria-pressed={theme === t.value}
              className={cn(
                'flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg text-[14px]',
                theme === t.value ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground'
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <Sheet open={!!menuFor} onClose={() => setMenuFor(null)} title={menuFor?.name}>
        {menuFor && (
          <>
            <SheetAction
              icon={FolderPlus}
              label="하위 데스크 추가"
              onClick={() => {
                setCreating({ parentId: menuFor.id })
                setMenuFor(null)
              }}
            />
            <SheetAction
              icon={Pencil}
              label="이름 바꾸기"
              onClick={() => {
                setRenaming(menuFor)
                setMenuFor(null)
              }}
            />
            <SheetAction
              icon={Trash2}
              label="휴지통으로 이동"
              danger
              onClick={() => {
                void deleteWorkspace(menuFor.id)
                setMenuFor(null)
              }}
            />
          </>
        )}
      </Sheet>

      <PromptSheet
        open={!!creating}
        title={creating?.parentId ? '하위 데스크 만들기' : '새 데스크'}
        placeholder="예: 마케팅, 신규 프로젝트"
        submitLabel="만들기"
        onSubmit={(name) => void create(name)}
        onClose={() => setCreating(null)}
      />
      <PromptSheet
        open={!!renaming}
        title="데스크 이름 바꾸기"
        placeholder="데스크 이름"
        initial={renaming?.name}
        submitLabel="저장"
        onSubmit={(name) => renaming && void renameWorkspace(renaming.id, name)}
        onClose={() => setRenaming(null)}
      />
    </div>
  )
}

/** PC sync at a glance (tap → settings, where pairing and "지금 동기화" live). */
function PcLinkRow({ onOpen }: { onOpen: () => void }): JSX.Element {
  const [link, setLink] = useState<PcLinkStatus | null>(null)
  useEffect(() => {
    void window.api.pcLink.status().then(setLink, () => setLink(null))
  }, [])
  const detail = !link?.linked
    ? '같은 Wi-Fi의 PC와 메모를 맞춥니다'
    : link.last_error
      ? `${link.pcName} · 연결 안 됨`
      : `${link.pcName} · ${link.last_sync ? `${formatRelative(link.last_sync)} 동기화` : '연결됨'}`
  return (
    <Row
      icon={<Monitor className={cn('h-5 w-5', link?.linked && !link.last_error && 'text-primary')} />}
      label={link?.linked ? 'PC 연결' : 'PC와 연결하기'}
      detail={detail}
      onClick={onOpen}
    />
  )
}
