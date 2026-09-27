import { X } from 'lucide-react'
import { DEFAULT_GRAPH_SETTINGS, GRAPH_RANGES, type GraphSettings } from '@/lib/graphStyle'

type NumericKey = keyof typeof GRAPH_RANGES

const SECTIONS: { title: string; rows: { key: NumericKey; label: string }[] }[] = [
  {
    title: '표시',
    rows: [
      { key: 'nodeSize', label: '노드 크기' },
      { key: 'linkWidth', label: '링크 두께' },
      { key: 'textFade', label: '글자 표시 시작 배율' }
    ]
  },
  {
    title: '힘',
    rows: [
      { key: 'repulsion', label: '반발력' },
      { key: 'linkLength', label: '링크 거리' },
      { key: 'gravity', label: '중심 인력' }
    ]
  }
]

interface GraphSettingsPanelProps {
  settings: GraphSettings
  onChange: (next: GraphSettings) => void
  onClose: () => void
}

/** Obsidian's graph "display / forces" panel: live sliders, remembered between sessions. */
export function GraphSettingsPanel({ settings, onChange, onClose }: GraphSettingsPanelProps): JSX.Element {
  return (
    <section
      aria-label="그래프 표시 설정"
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      className="glass-overlay absolute right-3 top-14 z-10 w-64 rounded-xl p-3 text-xs"
    >
      <header className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">표시 설정</h3>
        <button onClick={onClose} aria-label="닫기" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      {SECTIONS.map((section) => (
        <fieldset key={section.title} className="mb-3">
          <legend className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{section.title}</legend>
          {section.rows.map(({ key, label }) => {
            const range = GRAPH_RANGES[key]
            return (
              <label key={key} className="mb-2 block">
                <span className="mb-1 block text-foreground/85">{label}</span>
                <input
                  type="range"
                  min={range.min}
                  max={range.max}
                  step={range.step}
                  value={settings[key]}
                  onChange={(e) => onChange({ ...settings, [key]: Number(e.target.value) })}
                  className="w-full accent-[hsl(var(--primary))]"
                />
              </label>
            )
          })}
        </fieldset>
      ))}

      <label className="mb-3 flex items-center gap-2">
        <input
          type="checkbox"
          checked={settings.deskColors}
          onChange={(e) => onChange({ ...settings, deskColors: e.target.checked })}
          className="accent-[hsl(var(--primary))]"
        />
        데스크 색으로 메모 구분
      </label>

      <button
        onClick={() => onChange(DEFAULT_GRAPH_SETTINGS)}
        className="w-full rounded-md border border-border py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        기본값으로
      </button>
    </section>
  )
}
