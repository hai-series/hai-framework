import path from 'node:path'
import process from 'node:process'

import { defineConfig } from '@playwright/test'

const baseURL = process.env.BASE_URL || 'http://127.0.0.1:4173'
const previewUrl = new URL(baseURL)
const previewHost = previewUrl.hostname || '127.0.0.1'
const previewPort = Number.parseInt(previewUrl.port || '4173', 10)
const testDataDir = path.join(process.env.HAI_E2E_DATA_ROOT || '.', `data-e2e-transport-off-${Date.now()}`)

/**
 * Admin Console - Playwright E2E 测试配置
 *
 * 使用本地安装的 Chrome 浏览器，无需额外下载 Chromium
 */
export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/debug-login.spec.ts', '**/transport-on.spec.ts'],
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  metadata: { notificationFixture: true },
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

  webServer: [{
    command: 'node e2e/notification-fixture.mjs',
    env: { IAM_FIXTURE_LDAP: '1' },
    url: 'http://127.0.0.1:12580',
    reuseExistingServer: false,
    timeout: 90_000,
  }, {
    command: `pnpm build && pnpm exec vite preview --host ${previewHost} --port ${previewPort} --strictPort`,
    env: {
      HAI_E2E: '1',
      HAI_CORE_ENV: 'production',
      // LDAP 是可选 YAML 字段，使用整个 IAM 对象覆盖并保留本轮验收的密码/会话策略。
      HAI_IAM: JSON.stringify({
        login: { password: true, otp: true, ldap: true },
        password: { minLength: 8, maxLength: 128, requireUppercase: false, requireLowercase: false, requireNumber: false, requireSpecialChar: false },
        session: { maxAge: 900, refreshTokenMaxAge: 604800 },
        otp: {},
        ldap: { url: 'ldap://127.0.0.1:12583', bindDn: 'cn=admin,dc=example,dc=org', bindPassword: 'admin', searchBase: 'ou=users,dc=example,dc=org' },
        agreements: { showOnRegister: true, showOnLogin: false, userAgreementMarkdown: '# 配置中的用户协议\n\n**注册须知**\n\n- 请保管好账户凭据。', userAgreementUrl: 'http://127.0.0.1:12580/terms', privacyPolicyUrl: 'http://127.0.0.1:12580/privacy' },
        ui: { variant: 'split', brandTitle: 'IAM flow branding', illustrationUrl: '/iam-illustration.svg' },
      }),
      HAI_REACH_PROVIDERS: JSON.stringify([{ name: 'email', type: 'api', url: 'http://127.0.0.1:12580/send' }, { name: 'sms', type: 'api', url: 'http://127.0.0.1:12580/send' }]),
      HAI_ADMIN_DEFAULT_PASSWORD: 'admin123456',
      HAI_DB_DATABASE: `${testDataDir}/admin.db`,
      HAI_STORAGE_ROOT: `${testDataDir}/uploads`,
      NODE_ENV: 'test',
      HAI_KIT_TRANSPORT: 'false',
    },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
  }],
})
