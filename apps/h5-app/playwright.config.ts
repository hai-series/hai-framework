import process from 'node:process'
import { defineConfig } from '@playwright/test'

const baseURL = process.env.BASE_URL || 'http://localhost:4176'
const testDataDir = `./data-e2e-h5-${Date.now()}`

/**
 * hai H5 App - Playwright E2E 测试配置
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
    extraHTTPHeaders: {
      Origin: baseURL,
    },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  webServer: [{
    command: 'node ../admin-console/e2e/notification-fixture.mjs',
    url: 'http://127.0.0.1:12580',
    timeout: 30_000,
  }, {
    command: 'pnpm build && pnpm exec vite preview --port 4176 --strictPort',
    env: {
      HAI_E2E: '1',
      HAI_IAM_LOGIN_OTP: 'true',
      HAI_REACH_PROVIDERS: JSON.stringify([{ name: 'email', type: 'api', url: 'http://127.0.0.1:12580/send' }, { name: 'sms', type: 'api', url: 'http://127.0.0.1:12580/send' }]),
      HAI_IAM_AGREEMENTS: JSON.stringify({ showOnRegister: true, showOnLogin: false, userAgreementMarkdown: '# H5 配置协议\n\n**账户使用条款**\n\n- 请保管账户凭据。' }),
      HAI_DB_DATABASE: `${testDataDir}/h5.db`,
      HAI_STORAGE_ROOT: `${testDataDir}/uploads`,
    },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
  }],
})
