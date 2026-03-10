import process from 'node:process'
import { defineConfig } from '@playwright/test'

const baseURL = process.env.BASE_URL || 'http://localhost:4175'

/**
 * hai Corporate Website - Playwright E2E 测试配置
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 2,
  reporter: 'list',
  timeout: 30_000,

  use: {
    baseURL,
    channel: 'chrome',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  webServer: {
    command: 'pnpm build && pnpm exec vite preview --port 4175 --strictPort',
    env: {
      HAI_E2E: '1',
      HAI_PARTNER_ADMIN_USERNAME: 'partner-admin',
      HAI_PARTNER_ADMIN_PASSWORD: 'CHANGE_ME_STRONG_PASSWORD',
    },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
