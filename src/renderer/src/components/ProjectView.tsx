import { useEffect, useMemo, useState } from 'react'
import { FolderGit2, FolderOpen, GitBranch, GitCommitHorizontal, FileText, Terminal, AlertTriangle } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { useToast, toastError } from '@/store/useToast'
import { Button } from '@/components/ui/button'
import { formatRelative } from '@/lib/format'
import type { ProjectOverview, Workspace } from '@shared/types'

/** The desk's linked local folder: its docs (in the brain), git state, and a door to Claude Code. */
export function ProjectView({ desk }: { desk: Workspace }): JSX.Element {
  const version = useStore((s) => s.projectVersion)
  const previewFile = useStore((s) => s.previewFile)
  const refreshWorkspaces = useStore((s) => s.refreshWorkspaces)
  const showToast = useToast((s) => s.show)
  const [overview, setOverview] = useState<ProjectOverview | null>(null)

  useEffect(() => {
    if (!desk.folder_path) return setOverview(null)
    let current = true
    window.api.project.overview(desk.id).then((o) => current && setOverview(o), toastError)
    return () => {
      current = false
    }
  }, [desk.id, desk.folder_path, version])

  const groups = useMemo(() => {
    const byDir = new Map<string, ProjectOverview['files']>()
    for (const f of overview?.files ?? []) {
      const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : ''
      byDir.set(dir, [...(byDir.get(dir) ?? []), f])
    }
    return [...byDir.entries()]
  }, [overview])

  const choose = async (): Promise<void> => {
    try {
      if (await window.api.project.choose(desk.id)) {
        await refreshWorkspaces()
        showToast({ message: '프로젝트 폴더를 연결했습니다. 문서가 그래프와 백링크에 들어옵니다.' })
      }
    } catch (e) {
      toastError(e)
    }
  }

  const unlink = async (): Promise<void> => {
    try {
      await window.api.project.unlink(desk.id)
      await refreshWorkspaces()
    } catch (e) {
      toastError(e)
    }
  }

  if (!desk.folder_path) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md">
          <FolderGit2 className="h-8 w-8 text-muted-foreground/60" />
          <h2 className="mt-4 text-2xl font-bold tracking-tight">프로젝트 폴더를 연결하세요</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            개발 중인 레포나 문서 폴더를 이 데스크에 연결하면 README·docs 같은 문서가 메모와 함께 그래프와 백링크에
            들어오고, git 브랜치·커밋이 보이며, Claude Code가 이 데스크의 작업과 메모를 프로젝트 맥락으로 가져갑니다.
            파일은 읽기만 합니다.
          </p>
          <Button className="mt-6" onClick={choose}>
            <FolderOpen className="h-4 w-4" />
            폴더 연결…
          </Button>
        </div>
      </div>
    )
  }

  const name = desk.folder_path.split('/').filter(Boolean).pop()
  const git = overview?.git

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-8 py-6">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              <FolderGit2 className="h-6 w-6 shrink-0 text-primary" />
              <span className="truncate">{name}</span>
            </h2>
            <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{desk.folder_path}</p>
          </div>
          <Button size="sm" onClick={() => window.api.project.openInClaude(desk.id).catch(toastError)}>
            <Terminal className="h-3.5 w-3.5" />
            Claude Code로 열기
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.api.project.reveal(desk.id).catch(toastError)}>
            <FolderOpen className="h-3.5 w-3.5" />
            Finder
          </Button>
          <Button variant="ghost" size="sm" onClick={choose}>
            폴더 변경
          </Button>
          <Button variant="ghost" size="sm" onClick={unlink}>
            연결 해제
          </Button>
        </div>

        {overview && !overview.exists && (
          <p className="mt-4 flex items-center gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4" />
            폴더를 찾을 수 없습니다. 옮겼거나 지웠다면 ‘폴더 변경’으로 다시 연결하세요.
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {git ? (
            <>
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <GitBranch className="h-3.5 w-3.5" />
                {git.branch ?? '분리된 HEAD'}
              </span>
              <span>{git.changed > 0 ? `변경 ${git.changed}개` : '변경 없음'}</span>
              {git.ahead > 0 && <span>푸시 안 한 커밋 {git.ahead}</span>}
              {git.behind > 0 && <span>받을 커밋 {git.behind}</span>}
            </>
          ) : (
            overview?.exists && <span>git 저장소가 아닙니다 — 문서만 연결됩니다.</span>
          )}
          {overview && (
            <span>
              문서 {overview.files.length}개 · 전체 파일 {overview.totalFiles.toLocaleString()}개
              {overview.truncated && ' (일부만 색인)'}
            </span>
          )}
        </div>

        <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_minmax(0,22rem)]">
          <section aria-label="문서">
            <h3 className="border-b border-border pb-2 text-sm font-semibold">문서</h3>
            {overview && overview.files.length === 0 && (
              <p className="py-4 text-sm text-muted-foreground">.md / .txt 문서가 없습니다.</p>
            )}
            {groups.map(([dir, files]) => (
              <div key={dir} className="mt-3">
                <p className="px-2 pb-1 font-mono text-[11px] text-muted-foreground">{dir || '/'}</p>
                <ul>
                  {files.map((f) => (
                    <li key={f.path}>
                      <button
                        onClick={() => previewFile(desk.id, f.path)}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent/60"
                      >
                        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{f.title}</span>
                        <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">
                          {f.path.split('/').pop()}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>

          {git && (
            <section aria-label="최근 커밋">
              <h3 className="border-b border-border pb-2 text-sm font-semibold">최근 커밋</h3>
              {git.commits.length === 0 && <p className="py-4 text-sm text-muted-foreground">아직 커밋이 없습니다.</p>}
              <ul className="mt-2 space-y-0.5">
                {git.commits.slice(0, 20).map((c) => (
                  <li key={c.hash} className="flex gap-2 rounded-md px-2 py-1.5 text-sm">
                    <GitCommitHorizontal className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate">{c.subject}</p>
                      <p className="text-[11px] text-muted-foreground">
                        <span className="font-mono">{c.short}</span> · {c.author} · {formatRelative(c.date)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-3 px-2 text-[11px] leading-relaxed text-muted-foreground">
                커밋 메시지에 <code className="rounded bg-muted px-1">[[메모 제목]]</code>을 쓰면 그 메모의 백링크에
                커밋이 연결됩니다.
              </p>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
