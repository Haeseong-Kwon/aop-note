import type { EditCommand } from '@shared/ipc'

// macOS Korean (and other) IMEs: ⌘A/C/X/V pressed while a syllable is still composing only
// commits the syllable — the edit command itself is dropped, so "select all, copy" silently
// copies nothing. Replay the command natively once the composition has ended.
const COMMANDS: Record<string, EditCommand> = { KeyA: 'selectAll', KeyC: 'copy', KeyX: 'cut', KeyV: 'paste' }
const isMac = navigator.platform.startsWith('Mac')
// compositionend follows the keydown immediately; don't let a stale listener fire later.
const WAIT_MS = 200

export function replayEditKeysAfterComposition(): void {
  window.addEventListener(
    'keydown',
    (e) => {
      const command = COMMANDS[e.code]
      const mod = isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey
      if (!command || !e.isComposing || !mod || e.shiftKey || e.altKey) return
      const run = (): void => {
        clearTimeout(timer)
        void window.api.runEditCommand(command)
      }
      const timer = setTimeout(() => window.removeEventListener('compositionend', run, true), WAIT_MS)
      window.addEventListener('compositionend', run, { capture: true, once: true })
    },
    true
  )
}
