import process from 'node:process'

import { defineConfig } from '@playwright/test'

const baseURL = process.env.BASE_URL || 'http://127.0.0.1:4173'
const testDataDir = `./data-e2e-transport-on-${Date.now()}`

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/transport-on.spec.ts',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL,
    channel: 'chrome',
    extraHTTPHeaders: {
      Origin: baseURL,
    },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'pnpm build && pnpm exec vite preview --host 127.0.0.1 --port 4173 --strictPort',
    env: {
      HAI_E2E: '1',
      HAI_ADMIN_DEFAULT_PASSWORD: 'admin123456',
      HAI_RELDB_DATABASE: `${testDataDir}/admin.db`,
      HAI_STORAGE_PATH: `${testDataDir}/uploads`,
      NODE_ENV: 'test',
    },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
