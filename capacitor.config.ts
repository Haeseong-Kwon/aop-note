import type { CapacitorConfig } from '@capacitor/cli'

// Android shell for the WebView build (npm run android:build). Not used by the desktop app.
const config: CapacitorConfig = {
  appId: 'com.aop.note',
  appName: 'AOP Note',
  webDir: 'out/mobile',
  // Native HTTP for fetch: calendar feeds, link previews and the AI API work without CORS.
  plugins: { CapacitorHttp: { enabled: true } }
}

export default config
