import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  retries: 0,
  use: { baseURL: 'http://localhost:5175', channel: 'chrome' },
  webServer: [
    {
      command: 'node ../admin-console/e2e/notification-fixture.mjs',
      url: 'http://127.0.0.1:12580',
      reuseExistingServer: false,
    },
    {
      command: 'pnpm --filter api-service build && pnpm --filter api-service start:test',
      url: 'http://127.0.0.1:3000/health',
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: 'pnpm build && pnpm preview --mode test',
      url: 'http://localhost:5175',
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: 'pnpm --filter desktop-app build && pnpm --filter desktop-app preview --mode test',
      url: 'http://localhost:5176',
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
})
