import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useToast, toastError } from '@/store/useToast'
import { SettingRow } from './SettingsView'
import { cn } from '@/lib/utils'
import type { AiProvider, AiStatus, AppSettings } from '@shared/types'

const PROVIDERS: { value: AiProvider; label: string; hint: string }[] = [
  { value: 'claude-code', label: 'Claude Code', hint: '이 Mac에 로그인된 claude CLI로 실행 (구독 사용)' },
  { value: 'api', label: 'Anthropic API 키', hint: '직접 발급한 API 키로 실행 (사용량만큼 과금)' }
]

const MODELS: { value: string; label: string }[] = [
  { value: 'claude-opus-5', label: 'Claude Opus 5 (가장 똑똑함)' },
  { value: 'claude-sonnet-5', label: 'Claude Sonnet 5 (균형)' },
  { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (가장 빠름)' }
]

/** Settings → AI: how requests run, which model, the API key. */
export function AiSettings({
  settings,
  onSettings
}: {
  settings: AppSettings | null
  onSettings: (s: AppSettings) => void
}): JSX.Element {
  const showToast = useToast((s) => s.show)
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [key, setKey] = useState('')

  useEffect(() => {
    window.api.ai.status().then(setStatus, toastError)
  }, [settings?.aiProvider, settings?.aiModel])

  const update = async (patch: Partial<AppSettings>): Promise<void> => {
    try {
      onSettings(await window.api.settings.update(patch))
    } catch (e) {
      toastError(e)
    }
  }

  const saveKey = async (value: string | null): Promise<void> => {
    try {
      await window.api.ai.setKey(value)
      setKey('')
      setStatus(await window.api.ai.status())
      showToast({ message: value ? 'API 키를 macOS 키체인 암호화로 저장했습니다.' : 'API 키를 삭제했습니다.' })
    } catch (e) {
      toastError(e)
    }
  }

  const provider = settings?.aiProvider ?? 'claude-code'
  return (
    <>
      <SettingRow label="실행 방식" description={PROVIDERS.find((p) => p.value === provider)?.hint}>
        <div className="flex rounded-md bg-muted p-0.5">
          {PROVIDERS.map((p) => (
            <button
              key={p.value}
              onClick={() => void update({ aiProvider: p.value })}
              disabled={!settings}
              aria-pressed={provider === p.value}
              className={cn(
                'rounded px-2.5 py-1 text-xs transition-colors',
                provider === p.value ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </SettingRow>
      <SettingRow label="모델">
        <select
          value={settings?.aiModel ?? 'claude-opus-5'}
          disabled={!settings}
          onChange={(e) => void update({ aiModel: e.target.value })}
          className="rounded-md border border-border bg-background px-2 py-1 text-sm"
        >
          {MODELS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </SettingRow>
      {provider === 'claude-code' ? (
        <SettingRow
          label="Claude Code CLI"
          description={
            status?.cliPath
              ? `찾음: ${status.cliPath}`
              : 'claude CLI를 찾지 못했습니다. Claude Code를 설치하고 터미널에서 한 번 로그인하세요.'
          }
        />
      ) : (
        <SettingRow
          label="API 키"
          description={status?.hasKey ? '저장됨 (이 Mac에서만 복호화됩니다)' : 'console.anthropic.com에서 발급한 sk-ant- 로 시작하는 키'}
        >
          <div className="flex items-center gap-1.5">
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={status?.hasKey ? '새 키로 바꾸기' : 'sk-ant-…'}
              className="w-44 rounded-md border border-border bg-background px-2 py-1 text-sm"
            />
            <Button size="sm" variant="outline" disabled={!key.trim()} onClick={() => void saveKey(key.trim())}>
              저장
            </Button>
            {status?.hasKey && (
              <Button size="sm" variant="ghost" onClick={() => void saveKey(null)}>
                삭제
              </Button>
            )}
          </div>
        </SettingRow>
      )}
    </>
  )
}
