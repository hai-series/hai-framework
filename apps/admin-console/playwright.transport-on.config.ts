import process from 'node:process'

import { defineConfig } from '@playwright/test'

const baseURL = process.env.BASE_URL || 'http://127.0.0.1:4173'
const previewUrl = new URL(baseURL)
const previewHost = previewUrl.hostname || '127.0.0.1'
const previewPort = Number.parseInt(previewUrl.port || '4173', 10)
const testDataDir = `./data-e2e-transport-on-${Date.now()}`

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/transport-on.spec.ts',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
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
  webServer: [{
    // 共用 globalTeardown 会关闭通知 fixture，传输组也需完整装配它。
    command: 'node e2e/notification-fixture.mjs',
    url: 'http://127.0.0.1:12580',
    reuseExistingServer: false,
    timeout: 90_000,
  }, {
    command: `pnpm build && pnpm exec vite preview --host ${previewHost} --port ${previewPort} --strictPort`,
    env: {
      HAI_E2E: '1',
      HAI_CORE_ENV: 'development',
      HAI_ADMIN_DEFAULT_PASSWORD: 'admin123456',
      HAI_DB_DATABASE: `${testDataDir}/admin.db`,
      HAI_STORAGE_ROOT: `${testDataDir}/uploads`,
      NODE_ENV: 'test',
      VITE_HAI_E2E_KIT_TRANSPORT_MODE: 'on',
    },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
  }],
})
