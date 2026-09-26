import { useEffect, useState } from 'react'
import { FolderGit2, FolderOpen, GitBranch, Terminal, AlertTriangle, Plus } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { useToast, toastError } from '@/store/useToast'
import { Button } from '@/components/ui/button'
import { formatRelative } from '@/lib/format'
import { PageHeader } from './PageHeader'
import { DeskIcon } from './DeskIcon'
import type { ProjectSummary } from '@shared/types'

/** Every desk linked to a local folder, plus the desks that could be. */
export function ProjectsView(): JSX.Element {
  const workspaces = useStore((s) => s.workspaces)
  const version = useStore((s) => s.projectVersion)
  const selectWorkspace = useStore((s) => s.selectWorkspace)
  const setMainView = useStore((s) => s.setMainView)
  const refreshWorkspaces = useStore((s) => s.refreshWorkspaces)
  const showToast = useToast((s) => s.show)
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null)

  useEffect(() => {
    let current = true
    window.api.project.list().then((p) => current && setProjects(p), toastError)
    return () => {
      current = false
    }
  }, [version, workspaces])

  const open = async (deskId: string): Promise<void> => {
    await selectWorkspace(deskId)
    setMainView('project')
  }

  const link = async (deskId: string): Promise<void> => {
    try {
      if (await window.api.project.choose(deskId)) {
        await refreshWorkspaces() // re-runs the list effect
        showToast({ message: '프로젝트 폴더를 연결했습니다.' })
      }
    } catch (e) {
      toastError(e)
    }
  }

  const unlinked = workspaces.filter((w) => !w.folder_path)

  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={FolderGit2} title="프로젝트" count={projects?.length} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-8 py-6">
          <p className="text-sm text-muted-foreground">
            로컬 폴더(레포)가 연결된 데스크입니다. 문서는 그래프·백링크에 들어가고, Claude Code는 이 폴더에서 해당
            데스크의 작업과 메모를 맥락으로 가져갑니다.
          </p>

          {projects?.length === 0 && (
            <div className="mt-12 flex flex-col items-center gap-2 text-sm text-muted-foreground">
              <FolderGit2 className="h-8 w-8 opacity-40" />
              아직 연결된 프로젝트가 없습니다. 아래에서 데스크에 폴더를 연결하세요.
            </div>
          )}

          <ul className="mt-5 divide-y divide-border rounded-lg border border-border">
            {projects?.map((p) => (
              <li key={p.desk_id} className="group flex items-center gap-4 px-4 py-3 hover:bg-accent/40">
                <button onClick={() => open(p.desk_id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <DeskIcon color={p.color} icon={p.icon} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">{p.name}</span>
                      {p.git?.branch && (
                        <span className="flex shrink-0 items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                          <GitBranch className="h-3 w-3" />
                          {p.git.branch}
                        </span>
                      )}
                      {!p.exists && (
                        <span className="flex shrink-0 items-center gap-1 text-[11px] text-amber-700 dark:text-amber-300">
                          <AlertTriangle className="h-3 w-3" />
                          폴더 없음
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground">{p.folder}</span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">
                      문서 {p.docs}개
                      {p.git && ` · 변경 ${p.git.changed}개`}
                      {p.git?.ahead ? ` · 푸시 안 한 커밋 ${p.git.ahead}` : ''}
                      {p.git?.last_commit &&
                        ` · 최근 커밋 “${p.git.last_commit}”${p.git.last_commit_date ? ` (${formatRelative(p.git.last_commit_date)})` : ''}`}
                    </span>
                  </span>
                </button>
                <div className="flex shrink-0 gap-1 opacity-70 transition-opacity group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="sm"
                    title="Claude Code로 열기"
                    onClick={() => window.api.project.openInClaude(p.desk_id).catch(toastError)}
                  >
                    <Terminal className="h-3.5 w-3.5" />
                    Claude Code
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    title="Finder에서 열기"
                    onClick={() => window.api.project.reveal(p.desk_id).catch(toastError)}
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>

          {unlinked.length > 0 && (
            <section className="mt-10">
              <h2 className="border-b border-border pb-2 text-sm font-semibold">폴더가 연결되지 않은 데스크</h2>
              <ul className="mt-1">
                {unlinked.map((w) => (
                  <li key={w.id} className="flex items-center gap-3 px-2 py-2">
                    <DeskIcon color={w.color} icon={w.icon} />
                    <span className="flex-1 truncate text-sm">{w.name}</span>
                    <Button variant="outline" size="sm" onClick={() => link(w.id)}>
                      <Plus className="h-3.5 w-3.5" />
                      폴더 연결…
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
