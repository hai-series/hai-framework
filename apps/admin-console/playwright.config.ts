import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: ['**/smoke.spec.ts', '**/transport-on.spec.ts'],
  workers: 1,
  retries: 0,
  use: { baseURL: 'http://localhost:4173', channel: 'chrome' },
  webServer: {
    command: 'pnpm build && pnpm preview --mode test',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
