import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/** macOS draws the traffic-light buttons over the top-left of the frameless window. */
export const IS_MAC = navigator.userAgent.includes('Macintosh')
