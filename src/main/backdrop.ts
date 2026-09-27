import { nativeTheme, type BrowserWindow } from 'electron'

// What sits behind the renderer's translucent glass panels.
// macOS windowed: native under-window vibrancy (a blurred desktop).
// macOS full screen: nothing but the wallpaper is behind the window, so vibrancy would
// wash the whole UI in the wallpaper's colour (e.g. green in dark mode) — use a solid
// backdrop there, like every other platform.
const SOLID = { dark: '#0b0b0f', light: '#eef0f4' } as const

export const solidBackdrop = (): string => (nativeTheme.shouldUseDarkColors ? SOLID.dark : SOLID.light)

export function applyBackdrop(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  if (process.platform === 'darwin') {
    const glass = !win.isFullScreen()
    win.setVibrancy(glass ? 'under-window' : null)
    win.setBackgroundColor(glass ? '#00000000' : solidBackdrop())
    return
  }
  win.setBackgroundColor(solidBackdrop())
}
