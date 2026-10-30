import { useEffect, useState } from 'react'
import { Smartphone, Monitor, RefreshCw, Link2, Unlink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast, toastError } from '@/store/useToast'
import { SettingRow } from './SettingsView'
import { IS_ANDROID } from '@/lib/utils'
import { formatRelative } from '@/lib/format'
import { LAN_PORT } from '@shared/lanProtocol'
import type { LanStatus, PcLinkStatus } from '@shared/types'

/** Settings → PC · 휴대폰 연결: the desktop hosts, the phone pairs (same Wi-Fi, no cloud). */
export function DeviceLinkSettings(): JSX.Element {
  return IS_ANDROID ? <PhoneSide /> : <DesktopSide />
}

/** While a code is showing, look for the phone arriving every couple of seconds. */
const PAIRING_POLL_MS = 2000

function DesktopSide(): JSX.Element {
  const [status, setStatus] = useState<LanStatus | null>(null)
  const show = useToast((s) => s.show)

  useEffect(() => {
    void window.api.lan.status().then(setStatus, toastError)
  }, [])

  const pairing = status?.pairing
  const paired = status?.devices.length ?? 0
  useEffect(() => {
    if (!pairing) return
    const timer = setInterval(() => {
      void window.api.lan.status().then((next) => {
        setStatus(next)
        if (!next.pairing && next.devices.length > paired) show({ message: '휴대폰이 연결되었습니다. 이제 같은 Wi-Fi에서 자동으로 동기화됩니다.' })
      }, toastError)
    }, PAIRING_POLL_MS)
    return () => clearInterval(timer)
  }, [pairing, paired, show])

  const run = (work: () => Promise<LanStatus>): void => void work().then(setStatus, toastError)

  if (!status) return <></>
  return (
    <>
      <SettingRow
        label="같은 Wi-Fi에서 직접 동기화"
        description={
          status.enabled
            ? `같은 Wi-Fi의 휴대폰이 이 컴퓨터(${status.addresses[0] ?? '주소 없음'})와 직접 동기화합니다. 내용은 기기마다 다른 키로 암호화되어 오갑니다.`
            : status.error ?? '켜면 AOP Note 안드로이드 앱이 클라우드 없이 이 컴퓨터와 바로 동기화합니다. 처음 켤 때 방화벽이 연결 허용을 물으면 허용하세요.'
        }
      >
        {status.enabled ? (
          <div className="flex gap-1.5">
            <Button size="sm" onClick={() => run(window.api.lan.startPairing)}>
              <Smartphone className="h-3.5 w-3.5" />새 휴대폰 연결
            </Button>
            <Button variant="ghost" size="sm" onClick={() => run(window.api.lan.disable)}>
              끄기
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => run(window.api.lan.enable)}>
            켜기
          </Button>
        )}
      </SettingRow>

      {status.enabled && pairing && <PairingCard status={status} onCancel={() => setStatus({ ...status, pairing: null })} />}

      {status.devices.map((d) => (
        <SettingRow
          key={d.id}
          label={d.name}
          description={d.last_seen ? `마지막 동기화 ${formatRelative(d.last_seen)}` : '연결됨 · 아직 동기화 전'}
        >
          <Button variant="ghost" size="sm" onClick={() => run(() => window.api.lan.forget(d.id))}>
            <Unlink className="h-3.5 w-3.5" />
            연결 해제
          </Button>
        </SettingRow>
      ))}
    </>
  )
}

/** What to type on the phone: this computer's address and the one-time code. */
function PairingCard({ status, onCancel }: { status: LanStatus; onCancel: () => void }): JSX.Element {
  const address = status.addresses.length ? status.addresses.map((a) => (status.port === LAN_PORT ? a : `${a}:${status.port}`)) : ['(네트워크 연결 없음)']
  return (
    <div className="my-2 rounded-xl border border-primary/30 bg-primary/[0.05] p-4">
      <p className="text-sm font-medium">휴대폰의 AOP Note → 설정 → PC 연결에 입력하세요</p>
      <dl className="mt-3 grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2">
        <dt className="text-xs text-muted-foreground">PC 주소</dt>
        <dd className="font-mono text-base tabular-nums">{address.join('  또는  ')}</dd>
        <dt className="text-xs text-muted-foreground">연결 코드</dt>
        <dd className="select-all font-mono text-2xl font-semibold tracking-[0.12em]">{status.pairing!.code}</dd>
      </dl>
      <div className="mt-3 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {new Date(status.pairing!.expires_at).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })}까지 유효 · 휴대폰이 연결되면 자동으로 닫힙니다.
        </p>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          닫기
        </Button>
      </div>
    </div>
  )
}

function PhoneSide(): JSX.Element {
  const [status, setStatus] = useState<PcLinkStatus | null>(null)
  const [address, setAddress] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const show = useToast((s) => s.show)

  useEffect(() => {
    void window.api.pcLink.status().then(setStatus, toastError)
  }, [])

  const act = async (work: () => Promise<void>): Promise<void> => {
    setBusy(true)
    try {
      await work()
    } catch (e) {
      toastError(e)
      setStatus(await window.api.pcLink.status())
    } finally {
      setBusy(false)
    }
  }

  const link = (): Promise<void> =>
    act(async () => {
      const next = await window.api.pcLink.link({ address, code })
      // The fields go away with the form: take the keyboard with them.
      ;(document.activeElement as HTMLElement | null)?.blur()
      setStatus(next)
      setCode('')
      show({ message: `${next.pcName}와 연결했습니다. 이제 앱을 열 때와 메모를 고칠 때 자동으로 동기화됩니다.` })
    })

  const syncNow = (): Promise<void> =>
    act(async () => {
      const r = await window.api.pcLink.syncNow()
      setStatus(await window.api.pcLink.status())
      show({ message: r.merged || r.files ? `PC에서 ${r.merged}개 항목, 첨부 ${r.files}개를 맞췄습니다.` : '이미 PC와 같은 상태입니다.' })
    })

  if (!status) return <></>
  if (status.linked) {
    // Stacked rather than a SettingRow: a phone is too narrow for a name, a status line and two buttons side by side.
    return (
      <div className="py-3.5">
        <div className="flex items-center gap-2 text-[15px] font-medium">
          <Monitor className={status.last_error ? 'h-4 w-4 text-muted-foreground' : 'h-4 w-4 text-primary'} />
          <span className="min-w-0 truncate">{status.pcName}</span>
        </div>
        <p className={`mt-1 text-[13px] leading-relaxed ${status.last_error ? 'text-destructive' : 'text-muted-foreground'}`}>
          {status.last_error
            ? status.last_error
            : status.last_sync
              ? `마지막 동기화 ${formatRelative(status.last_sync)} · 같은 Wi-Fi에서 자동으로 맞춥니다.`
              : '연결됨 · 같은 Wi-Fi에서 자동으로 맞춥니다.'}
        </p>
        <div className="mt-3 flex gap-2">
          <Button variant="outline" disabled={busy} onClick={() => void syncNow()} className="h-11 flex-1 rounded-xl">
            <RefreshCw className={busy ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            지금 동기화
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => void window.api.pcLink.unlink().then(setStatus, toastError)} className="h-11 rounded-xl">
            <Unlink className="h-4 w-4" />
            연결 해제
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="py-3.5">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Monitor className="h-4 w-4 text-primary" />
        PC와 연결
      </div>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
        PC의 AOP Note에서 설정 → 휴대폰 연결을 켜고 "새 휴대폰 연결"을 누르면 나오는 주소와 코드를 입력하세요. 휴대폰과 PC는 같은 Wi-Fi에 있어야 합니다.
      </p>
      <form
        className="mt-3 flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void link()
        }}
      >
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="PC 주소 (예: 192.168.0.12)"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          className="h-12 rounded-xl border border-input bg-muted/40 px-4 font-mono text-[16px] outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="연결 코드 (XXXX-XXXX-XXXX)"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          className="h-12 rounded-xl border border-input bg-muted/40 px-4 font-mono text-[16px] uppercase tracking-wider outline-none focus:ring-2 focus:ring-ring"
        />
        <Button type="submit" disabled={busy || !address.trim() || code.replace(/[^0-9a-z]/gi, '').length !== 12} className="h-12 rounded-xl text-[15px]">
          <Link2 className="h-4 w-4" />
          {busy ? '연결하는 중…' : '연결'}
        </Button>
      </form>
    </div>
  )
}
