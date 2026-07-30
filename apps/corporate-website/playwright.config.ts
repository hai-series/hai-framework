import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { defineConfig } from '@playwright/test'

const baseURL = process.env.BASE_URL || 'http://localhost:4175'
const e2eDataRoot = path.join(tmpdir(), 'hai-framework-corporate-website-e2e')
const testDataDir = path.join(e2eDataRoot, `data-e2e-${Date.now()}`)

process.env.HAI_E2E_DATA_ROOT = e2eDataRoot

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
    extraHTTPHeaders: {
      Origin: baseURL,
    },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  webServer: {
    command: 'pnpm build && pnpm exec vite preview --port 4175 --strictPort',
    env: {
      HAI_E2E: '1',
      HAI_PARTNER_USERNAME: 'partner-admin',
      HAI_PARTNER_PASSWORD: 'CHANGE_ME_STRONG_PASSWORD',
      HAI_DB_DATABASE: `${testDataDir}/corporate-website.db`,
      HAI_STORAGE_ROOT: `${testDataDir}/uploads`,
    },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
