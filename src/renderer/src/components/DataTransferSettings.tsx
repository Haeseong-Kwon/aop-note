import { FolderInput, FileJson, FolderOutput, RefreshCw, Cloud, CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useStore } from '@/store/useStore'
import { useToast, toastError } from '@/store/useToast'
import { SettingRow } from './SettingsView'
import type { AppSettings } from '@shared/types'

interface Props {
  settings: AppSettings | null
  onSettings: (s: AppSettings) => void
}

/** Settings → 가져오기 · 내보내기 · 기기 간 동기화. */
export function DataTransferSettings({ settings, onSettings }: Props): JSX.Element {
  const show = useToast((s) => s.show)
  const selectWorkspace = useStore((s) => s.selectWorkspace)

  const run = async <T,>(work: () => Promise<T | null>, done: (v: T) => string): Promise<void> => {
    try {
      const v = await work()
      if (v !== null) show({ message: done(v) })
    } catch (e) {
      toastError(e)
    }
  }

  const importMarkdown = (): Promise<void> =>
    run(window.api.data.importMarkdown, (r) => {
      void window.api.workspace.list().then((workspaces) => {
        useStore.setState({ workspaces })
        return selectWorkspace(r.deskId)
      })
      return `'${r.deskName}' 데스크로 메모 ${r.notes}개, 폴더 ${r.folders}개를 가져왔습니다${r.skipped ? ` (큰 파일 ${r.skipped}개 건너뜀)` : ''}.`
    })

  const importJson = (): Promise<void> =>
    run(window.api.data.importJson, (n) => {
      void window.api.workspace.list().then((workspaces) => {
        useStore.setState({ workspaces })
        return useStore.getState().refresh()
      })
      return n ? `${n}개 항목을 가져왔습니다 (더 최신인 쪽을 유지).` : '새로 가져올 내용이 없습니다.'
    })

  const chooseSync = async (): Promise<void> => {
    try {
      const next = await window.api.data.syncChoose()
      if (next) {
        onSettings(next)
        show({ message: '동기화를 켰습니다. 다른 기기에서도 같은 폴더를 선택하세요.' })
      }
    } catch (e) {
      toastError(e)
    }
  }

  const syncNow = (): Promise<void> =>
    run(window.api.data.syncNow, (r) =>
      r.devices === 0
        ? '내 변경을 올렸습니다. 아직 같은 폴더를 쓰는 다른 기기가 없습니다.'
        : `동기화했습니다 — 다른 기기 ${r.devices}대에서 ${r.merged}개 항목, 첨부 ${r.files}개.`
    )

  return (
    <>
      <SettingRow
        label="Markdown 폴더 가져오기"
        description="Obsidian 볼트나 Notion의 'Markdown & CSV' 내보내기(압축 해제한 폴더)를 새 데스크로 가져옵니다. 하위 폴더는 폴더로, 페이지 간 링크는 [[링크]]로 바뀝니다."
      >
        <Button variant="outline" size="sm" onClick={importMarkdown}>
          <FolderInput className="h-3.5 w-3.5" />
          가져오기…
        </Button>
      </SettingRow>
      <SettingRow label="전체 Markdown으로 내보내기" description="모든 메모를 데스크/폴더 구조 그대로 .md 파일로 저장합니다 (첨부 포함).">
        <Button variant="outline" size="sm" onClick={() => run(window.api.data.exportMarkdown, (p) => `${p} 에 내보냈습니다.`)}>
          <FolderOutput className="h-3.5 w-3.5" />
          내보내기…
        </Button>
      </SettingRow>
      <SettingRow
        label="전체 JSON 내보내기 · 가져오기"
        description="데스크·폴더·메모·일정·목표를 한 파일로 저장하거나 합칩니다. 가져올 때는 항목마다 더 최근에 고친 쪽이 남습니다."
      >
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" onClick={() => run(window.api.data.exportJson, (p) => `${p} 로 저장했습니다.`)}>
            <FileJson className="h-3.5 w-3.5" />
            내보내기…
          </Button>
          <Button variant="outline" size="sm" onClick={importJson}>
            가져오기…
          </Button>
        </div>
      </SettingRow>
      <SettingRow
        label="캘린더 내보내기 (.ics)"
        description="일정과 기한이 있는 열린 작업을 iCalendar 파일로 저장합니다. Google 캘린더·Apple 캘린더·Outlook에서 가져오기로 열 수 있습니다."
      >
        <Button variant="outline" size="sm" onClick={() => run(window.api.data.exportIcs, (p) => `${p} 로 저장했습니다.`)}>
          <CalendarDays className="h-3.5 w-3.5" />
          내보내기…
        </Button>
      </SettingRow>
      <SettingRow
        label="기기 간 동기화"
        description={
          settings?.syncPath
            ? `${settings.syncPath}/AOP Note Sync 로 동기화 중 (수정 후 10초, 그리고 5분마다). 두 기기에서 같은 메모를 동시에 고치면 나중에 고친 쪽이 남습니다.`
            : 'iCloud Drive·Dropbox·OneDrive 같은 공유 폴더를 고르면 그 폴더를 쓰는 모든 기기의 데이터가 합쳐집니다. 데이터베이스 파일 자체는 공유 폴더에 두지 않습니다.'
        }
      >
        {settings?.syncPath ? (
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" onClick={syncNow}>
              <RefreshCw className="h-3.5 w-3.5" />
              지금 동기화
            </Button>
            <Button variant="ghost" size="sm" onClick={() => window.api.data.syncDisable().then(onSettings, toastError)}>
              끄기
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={chooseSync}>
            <Cloud className="h-3.5 w-3.5" />
            폴더 선택…
          </Button>
        )}
      </SettingRow>
    </>
  )
}
