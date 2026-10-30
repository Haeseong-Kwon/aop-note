/// <reference types="vite/client" />
import type { Api } from '@shared/ipc'

declare global {
  interface Window {
    api: Api
    /** Android build only: turns an aop-file:// URL into one the WebView can load. */
    aopResolveFileUrl?: (url: string) => Promise<string>
    /** Android build only: the back button asks the phone shell first; false = nothing to close, leave the app. */
    aopBack?: () => boolean
  }
}

export {}
