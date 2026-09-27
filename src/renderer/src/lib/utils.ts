import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/** macOS draws the traffic-light buttons over the top-left of the frameless window. */
export const IS_MAC = navigator.userAgent.includes('Macintosh')

/** A shortcut in the platform's notation: shortcut('Mod', 'P') → "⌘P" on macOS, "Ctrl+P" on Windows. */
export function shortcut(...keys: string[]): string {
  if (IS_MAC) return keys.map((k) => (k === 'Mod' ? '⌘' : k === 'Shift' ? '⇧' : k)).join('')
  return keys.map((k) => (k === 'Mod' ? 'Ctrl' : k)).join('+')
}

/** "⌘+클릭" / "Ctrl+클릭" */
export const MOD_CLICK = `${IS_MAC ? '⌘' : 'Ctrl'}+클릭`

/** The OS file manager's name, for "reveal in …" buttons. */
export const FILE_MANAGER = IS_MAC ? 'Finder' : '탐색기'
