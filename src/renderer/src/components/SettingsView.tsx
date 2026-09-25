import { useEffect, useState, type ReactNode } from 'react'
import { Settings, Download, Upload, FolderOpen } from 'lucide-react'
import { useToast, toastError } from '@/store/useToast'
import { Button } from '@/components/ui/button'
import { PageHeader } from './PageHeader'
import { cn } from '@/lib/utils'
import type { AppSettings, BackupInfo } from '@shared/types'

export function SettingsView(): JSX.Element {
  const showToast = useToast((s) => s.show)
  const [info, setInfo] = useState<BackupInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [settings, setSettings] = useState<AppSettings | null>(null)

  useEffect(() => {
    window.api.backup.info().then(setInfo, toastError)
    window.api.settings.get().then(setSettings, toastError)
  }, [])

  const toggle = async (key: keyof AppSettings): Promise<void> => {
    if (!settings) return
    const value = !settings[key]
    setSettings({ ...settings, [key]: value }) // optimistic
    try {
      setSettings(await window.api.settings.update({ [key]: value }))
    } catch (e) {
      setSettings({ ...settings, [key]: !value })
      toastError(e)
    }
  }

  const exportBackup = async (): Promise<void> => {
    setBusy(true)
    try {
      const path = await window.api.backup.export()
      if (path) showToast({ message: `백업을 저장했습니다: ${path}` })
    } catch (e) {
      toastError(e)
    } finally {
      setBusy(false)
    }
  }

  const restoreBackup = async (): Promise<void> => {
    try {
      await window.api.backup.restore() // relaunches the app on success
    } catch (e) {
      toastError(e)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={Settings} title="설정" />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-8 py-6">
          <Section title="일반">
            <SettingRow label="로그인 시 자동 실행" description="Mac을 켜면 AOP Note가 백그라운드에서 시작되어 알림을 놓치지 않습니다.">
              <Switch
                label="로그인 시 자동 실행"
                checked={settings?.launchAtLogin ?? false}
                disabled={!settings}
                onChange={() => toggle('launchAtLogin')}
              />
            </SettingRow>
            <SettingRow
              label="어디서나 빠른 추가 (⌘⇧Space)"
              description="다른 앱을 쓰는 중에도 단축키로 작업을 바로 추가합니다."
            >
              <Switch
                label="어디서나 빠른 추가"
                checked={settings?.globalShortcut ?? false}
                disabled={!settings}
                onChange={() => toggle('globalShortcut')}
              />
            </SettingRow>
            <SettingRow
              label="오늘 마감 알림"
              description="오늘이 기한인 작업을 알려 줍니다. 작업에 직접 설정한 시간 알림은 이 설정과 관계없이 울립니다."
            >
              <Switch
                label="오늘 마감 알림"
                checked={settings?.dueNotifications ?? false}
                disabled={!settings}
                onChange={() => toggle('dueNotifications')}
              />
            </SettingRow>
          </Section>

          <Section title="데이터">
            <SettingRow
              label="백업 내보내기"
              description="모든 데스크, 작업, 메모와 첨부 파일을 선택한 폴더에 저장합니다."
            >
              <Button variant="outline" size="sm" onClick={exportBackup} disabled={busy}>
                <Download className="h-3.5 w-3.5" />
                {busy ? '저장 중…' : '내보내기'}
              </Button>
            </SettingRow>
            <SettingRow
              label="백업에서 복원"
              description="백업 폴더의 데이터로 바꿉니다. 현재 데이터는 복원 전에 자동으로 보관됩니다."
            >
              <Button variant="outline" size="sm" onClick={restoreBackup}>
                <Upload className="h-3.5 w-3.5" />
                복원…
              </Button>
            </SettingRow>
            <SettingRow
              label="자동 백업"
              description={`매일 앱을 처음 열 때 최근 7일치를 보관합니다. 마지막 자동 백업: ${
                info?.last_auto_backup ?? '아직 없음'
              }`}
            />
            <SettingRow label="데이터 폴더" description={info?.data_dir ?? ''}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.api.backup.openDataFolder().catch(toastError)}
              >
                <FolderOpen className="h-3.5 w-3.5" />
                폴더 열기
              </Button>
            </SettingRow>
          </Section>
        </div>
      </div>
    </div>
  )
}

export function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <section className="mb-10">
      <h2 className="border-b border-border pb-2 text-base font-semibold tracking-tight">{title}</h2>
      <div className="divide-y divide-border">{children}</div>
    </section>
  )
}

interface SettingRowProps {
  label: string
  description?: string
  children?: ReactNode
}

export function SettingRow({ label, description, children }: SettingRowProps): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-6 py-3.5">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {description && (
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  )
}

interface SwitchProps {
  label: string
  checked: boolean
  disabled?: boolean
  onChange: () => void
}

function Switch({ label, checked, disabled, onChange }: SwitchProps): JSX.Element {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        'relative h-5 w-9 rounded-full transition-colors disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-muted-foreground/30'
      )}
    >
      <span
        className={cn(
          'absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
          checked && 'translate-x-4'
        )}
      />
    </button>
  )
}
