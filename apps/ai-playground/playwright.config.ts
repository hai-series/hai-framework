import process from 'node:process'
import { defineConfig } from '@playwright/test'

const baseURL = process.env.BASE_URL || 'http://localhost:4180'
const live = process.env.HAI_E2E_LIVE === '1'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  timeout: live ? 180_000 : 30_000,

  use: {
    baseURL,
    channel: 'chrome',
    extraHTTPHeaders: { Origin: baseURL },
    permissions: ['microphone'],
    launchOptions: {
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  webServer: {
    command: 'pnpm build && pnpm exec vite preview --port 4180 --strictPort',
    env: {
      HAI_E2E: '1',
      HAI_E2E_MOCK: live ? '0' : '1',
    },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
