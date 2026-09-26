import { useState } from 'react'
import { DatabaseView } from './memo/database/DatabaseView'
import { defaultViewConfig, parseViewConfig, type ViewConfig } from '@/lib/database'

const key = (deskId: string): string => `aop-db-view:${deskId}`

function load(deskId: string): ViewConfig {
  try {
    const stored = localStorage.getItem(key(deskId))
    const cfg = stored ? parseViewConfig(stored) : null
    if (cfg?.workspaceId === deskId) return cfg
  } catch {
    /* unreadable → default */
  }
  return { ...defaultViewConfig(deskId, null), title: '모든 작업' }
}

/** The desk's own database tab: every task with custom properties, view remembered per desk. */
export function DeskDatabase({ deskId }: { deskId: string }): JSX.Element {
  const [cfg, setCfg] = useState(() => load(deskId))
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-8 py-6">
        <DatabaseView
          cfg={cfg}
          onConfig={(next) => {
            setCfg(next)
            localStorage.setItem(key(deskId), JSON.stringify(next))
          }}
        />
      </div>
    </div>
  )
}
