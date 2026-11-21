import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:4297',
    channel: 'chrome',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm build && pnpm start',
    url: 'http://127.0.0.1:4297/hai-framework/',
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
