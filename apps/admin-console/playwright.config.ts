import process from 'node:process'

import { defineConfig } from '@playwright/test'

const baseURL = process.env.BASE_URL || 'http://localhost:4173'
const testDataDir = `./data-e2e-transport-off-${Date.now()}`

/**
 * Admin Console - Playwright E2E 测试配置
 *
 * 使用本地安装的 Chrome 浏览器，无需额外下载 Chromium
 */
export default defineConfig({
  testDir: './e2e',
  testIgnore: ['./e2e/debug-login.spec.ts', './e2e/transport-on.spec.ts'],
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // 共用单个 preview 服务与同一份 SQLite / storage 测试数据目录时，文件级并发会放大状态串扰与锁竞争。
  workers: 1,
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
    command: 'pnpm build && pnpm exec vite preview --port 4173 --strictPort',
    env: {
      HAI_E2E: '1',
      HAI_ADMIN_DEFAULT_PASSWORD: 'admin123456',
      HAI_RELDB_DATABASE: `${testDataDir}/admin.db`,
      HAI_STORAGE_PATH: `${testDataDir}/uploads`,
      NODE_ENV: 'test',
      VITE_HAI_E2E_KIT_TRANSPORT_MODE: 'off',
    },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
