import process from 'node:process'

import { defineConfig } from '@playwright/test'

const baseURL = process.env.BASE_URL || 'http://localhost:4173'

/**
 * Admin Console - Playwright E2E 测试配置
 *
 * 使用本地安装的 Chrome 浏览器，无需额外下载 Chromium
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
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
    command: 'pnpm build && pnpm preview --port 4173 --strictPort',
    env: {
      HAI_E2E: '1',
    },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
