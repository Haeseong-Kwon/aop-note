import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json'

// Android (Capacitor) build: the renderer plus the main-process code, bundled for the WebView.
// Node/Electron modules main code imports are swapped for in-page shims (src/mobile/shims).
const shim = (name: string): string => resolve('src/mobile/shims', name)

export default defineConfig({
  root: 'src/mobile',
  base: './',
  publicDir: resolve('src/renderer/public'),
  plugins: [react()],
  define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version) },
  css: { postcss: resolve('.') },
  resolve: {
    alias: [
      { find: '@', replacement: resolve('src/renderer/src') },
      { find: '@shared', replacement: resolve('src/shared') },
      { find: 'electron', replacement: shim('electron.ts') },
      { find: 'better-sqlite3', replacement: shim('better-sqlite3.ts') },
      { find: /^(node:)?fs\/promises$/, replacement: shim('fs-promises.ts') },
      { find: /^(node:)?fs$/, replacement: shim('fs.ts') },
      { find: /^(node:)?path$/, replacement: 'path-browserify' },
      { find: /^(node:)?(child_process|os|url|net|dns\/promises|crypto)$/, replacement: shim('node.ts') },
      { find: 'electron-updater', replacement: shim('node.ts') }
    ]
  },
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  build: {
    outDir: resolve('out/mobile'),
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 8000
  }
})
