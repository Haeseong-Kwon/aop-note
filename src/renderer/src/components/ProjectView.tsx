import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, FileText, FolderGit2, FolderOpen, FolderPlus, GitBranch, GitCommitHorizontal, Terminal, Unlink } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { useToast, toastError } from '@/store/useToast'
import { Button } from '@/components/ui/button'
import { formatRelative } from '@/lib/format'
import type { ProjectFolderInfo, ProjectOverview, Workspace } from '@shared/types'
import { FILE_MANAGER } from '@/lib/utils'

const COMMITS_SHOWN = 12

/** The desk's linked local folders (a project can span a docs folder and several repos):
 *  managed as a list, their documents in the brain, git state, and a door to Claude Code. */
export function ProjectView({ desk }: { desk: Workspace }): JSX.Element {
  const version = useStore((s) => s.projectVersion)
  const previewFile = useStore((s) => s.previewFile)
  const refreshWorkspaces = useStore((s) => s.refreshWorkspaces)
  const showToast = useToast((s) => s.show)
  const [overview, setOverview] = useState<ProjectOverview | null>(null)

  const reload = (): Promise<void> => window.api.project.overview(desk.id).then(setOverview, toastError)
  useEffect(() => {
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

  const addFolder = async (): Promise<void> => {
    try {
      if (await window.api.project.choose(desk.id)) {
        await refreshWorkspaces()
        await reload()
        showToast({ message: '폴더를 연결했습니다. 문서가 그래프와 백링크에 들어옵니다.' })
      }
    } catch (e) {
      toastError(e)
    }
  }

  const unlink = async (folder: ProjectFolderInfo): Promise<void> => {
    try {
      await window.api.project.unlink(desk.id, folder.path)
      await refreshWorkspaces()
      await reload()
      showToast({ message: `‘${folder.label}’ 폴더 연결을 해제했습니다. 폴더의 파일은 그대로입니다.` })
    } catch (e) {
      toastError(e)
    }
  }

  const folders = overview?.folders ?? []
  if (overview === null && !desk.folder_path) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md">
          <FolderGit2 className="h-8 w-8 text-muted-foreground/60" />
          <h2 className="mt-4 text-2xl font-bold tracking-tight">프로젝트 폴더를 연결하세요</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            개발 중인 레포나 문서 폴더를 이 데스크에 연결하면 README·docs, PDF·한글·오피스 문서가 메모와 함께 그래프와 백링크에
            들어오고, git 브랜치·커밋이 보이며, Claude Code가 이 데스크의 작업과 메모를 프로젝트 맥락으로 가져갑니다. 한
            프로젝트에 폴더를 여러 개 연결할 수 있고, 파일은 읽기만 합니다.
          </p>
          <Button className="mt-6" onClick={addFolder}>
            <FolderOpen className="h-4 w-4" />
            폴더 연결…
          </Button>
        </div>
      </div>
    )
  }

  const repos = folders.filter((f) => f.git)

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-8 py-6">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="flex min-w-[12rem] flex-1 items-center gap-2 text-2xl font-bold tracking-tight">
            <FolderGit2 className="h-6 w-6 shrink-0 text-primary" />
            연결된 폴더 <span className="text-base font-medium text-muted-foreground">{folders.length}</span>
          </h2>
          <Button size="sm" onClick={addFolder}>
            <FolderPlus className="h-3.5 w-3.5" />
            폴더 추가…
          </Button>
        </div>
        {overview && (
          <p className="mt-1 text-xs text-muted-foreground">
            문서 {overview.files.length}개 · 전체 파일 {overview.totalFiles.toLocaleString()}개{overview.truncated && ' (일부만 색인)'}
            {folders.length > 1 && ' · 문서 경로는 폴더 이름으로 시작합니다'}
          </p>
        )}

        <ul aria-label="연결된 폴더" className="mt-4 divide-y divide-border rounded-lg border border-border">
          {folders.map((f, i) => (
            <FolderRow
              key={f.path}
              folder={f}
              primary={i === 0 && folders.length > 1}
              onClaude={() => window.api.project.openInClaude(desk.id, f.path).catch(toastError)}
              onReveal={() => window.api.project.reveal(desk.id, f.path).catch(toastError)}
              onUnlink={() => void unlink(f)}
            />
          ))}
        </ul>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_minmax(0,22rem)]">
          <section aria-label="문서">
            <h3 className="border-b border-border pb-2 text-sm font-semibold">문서</h3>
            {overview && overview.files.length === 0 && <p className="py-4 text-sm text-muted-foreground">문서가 없습니다.</p>}
            {groups.map(([dir, files]) => (
              <div key={dir} className="mt-3">
                <p className="px-2 pb-1 font-mono text-[11px] text-muted-foreground">{dir ? dir.split('/').join(' / ') : '/'}</p>
                <ul>
                  {files.map((f) => (
                    <li key={f.path}>
                      <button
                        onClick={() => previewFile(desk.id, f.path)}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent/60"
                      >
                        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{f.title}</span>
                        <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">{f.path.split('/').pop()}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>

          {repos.length > 0 && (
            <section aria-label="최근 커밋">
              <h3 className="border-b border-border pb-2 text-sm font-semibold">최근 커밋</h3>
              {repos.map((f) => (
                <div key={f.path} className="mt-3">
                  {repos.length > 1 && <p className="px-2 pb-1 text-[11px] font-medium text-muted-foreground">{f.label}</p>}
                  {f.git?.commits.length === 0 && <p className="px-2 py-2 text-sm text-muted-foreground">아직 커밋이 없습니다.</p>}
                  <ul className="space-y-0.5">
                    {f.git?.commits.slice(0, COMMITS_SHOWN).map((c) => (
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
                </div>
              ))}
              <p className="mt-3 px-2 text-[11px] leading-relaxed text-muted-foreground">
                커밋 메시지에 <code className="rounded bg-muted px-1">[[메모 제목]]</code>을 쓰면 그 메모의 백링크에 커밋이 연결됩니다.
              </p>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

interface FolderRowProps {
  folder: ProjectFolderInfo
  primary: boolean
  onClaude: () => void
  onReveal: () => void
  onUnlink: () => void
}

function FolderRow({ folder, primary, onClaude, onReveal, onUnlink }: FolderRowProps): JSX.Element {
  const git = folder.git
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <FolderGit2 className="h-5 w-5 shrink-0 text-primary/80" />
      <div className="min-w-[12rem] flex-1">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <span className="truncate">{folder.label}</span>
          {primary && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">기본</span>}
        </p>
        <p className="truncate font-mono text-[11px] text-muted-foreground">{folder.path}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 text-[11px] text-muted-foreground">
          {!folder.exists ? (
            <span className="flex items-center gap-1 text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-3 w-3" />
              폴더를 찾을 수 없습니다 — 옮겼다면 해제 후 다시 추가하세요
            </span>
          ) : (
            <>
              {git ? (
                <span className="flex items-center gap-1 font-medium text-foreground/80">
                  <GitBranch className="h-3 w-3" />
                  {git.branch ?? '분리된 HEAD'}
                  <span className="font-normal text-muted-foreground">
                    · {git.changed > 0 ? `변경 ${git.changed}개` : '변경 없음'}
                    {git.ahead > 0 && ` · 푸시 안 한 커밋 ${git.ahead}`}
                  </span>
                </span>
              ) : (
                <span>git 저장소 아님</span>
              )}
              <span>
                문서 {folder.docs}개 · 전체 파일 {folder.totalFiles.toLocaleString()}개
              </span>
            </>
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button size="sm" variant="outline" onClick={onClaude} disabled={!folder.exists} title="이 폴더에서 Claude Code 열기">
          <Terminal className="h-3.5 w-3.5" />
          Claude Code
        </Button>
        <Button size="sm" variant="ghost" onClick={onReveal} disabled={!folder.exists} title={`${FILE_MANAGER}에서 열기`}>
          <FolderOpen className="h-3.5 w-3.5" />
          {FILE_MANAGER}
        </Button>
        <Button size="sm" variant="ghost" onClick={onUnlink} title="연결 해제 (폴더의 파일은 그대로)">
          <Unlink className="h-3.5 w-3.5" />
          해제
        </Button>
      </div>
    </li>
  )
}
