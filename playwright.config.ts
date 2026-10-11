import { defineConfig } from '@playwright/test'

// E2E: drives the built Electron app (npm run build first). Each test gets a fresh data folder.
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  workers: 1,
  reporter: 'list',
  use: { trace: 'retain-on-failure' }
})
