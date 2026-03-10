import process from 'node:process'
import { defineConfig } from '@playwright/test'

const baseURL = process.env.BASE_URL || 'http://localhost:4174'

/**
 * api-service - Playwright E2E 配置
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
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  webServer: {
    command: 'pnpm build && pnpm exec vite preview --port 4174 --strictPort',
    env: {
      HAI_E2E: '1',
    },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
