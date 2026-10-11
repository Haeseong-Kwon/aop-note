import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toastError } from '@/store/useToast'
import { SettingRow } from './SettingsView'
import type { UpdateStatus } from '@shared/types'

const describe = (s: UpdateStatus): string => {
  switch (s.state) {
    case 'checking':
      return '확인 중…'
    case 'latest':
      return '최신 버전입니다.'
    case 'available':
      return `${s.latest} 버전이 나왔습니다. 다운로드 페이지에서 받아 설치하세요.`
    case 'downloading':
      return `${s.latest} 버전을 내려받는 중입니다. 끝나면 다시 시작하라고 알려 드립니다.`
    case 'ready':
      return `${s.latest} 업데이트가 준비되었습니다. 앱을 다시 시작하면 적용됩니다.`
    case 'error':
      return `확인하지 못했습니다: ${s.error ?? '알 수 없는 오류'}`
    case 'unsupported':
      return s.error ?? ''
    default:
      return '6시간마다 GitHub Releases에서 새 버전을 확인합니다.'
  }
}

/** Settings → 업데이트: current version and a manual check. */
export function UpdateRow(): JSX.Element {
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  useEffect(() => {
    window.api.update.status().then(setStatus, toastError)
  }, [])
  const check = (): void => {
    setStatus((s) => (s ? { ...s, state: 'checking' } : s))
    window.api.update.check().then(setStatus, toastError)
  }
  return (
    <SettingRow label={`버전 ${status?.current ?? ''}`} description={status ? describe(status) : ''}>
      <Button variant="outline" size="sm" onClick={check} disabled={status?.state === 'checking'}>
        <RefreshCw className="h-3.5 w-3.5" />
        업데이트 확인
      </Button>
    </SettingRow>
  )
}
