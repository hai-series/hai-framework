import path from 'node:path'
import process from 'node:process'

import { defineConfig } from '@playwright/test'
import { createE2eServerEnv } from '../../scripts/e2e-env.js'

const baseURL = process.env.BASE_URL || process.env.ADMIN_E2E_BASE_URL || 'http://127.0.0.1:4173'
const previewUrl = new URL(baseURL)
const previewHost = previewUrl.hostname || '127.0.0.1'
const previewPort = Number.parseInt(previewUrl.port || '4173', 10)
const testDataDir = path.join(process.env.HAI_E2E_DATA_ROOT || '.', `data-e2e-transport-off-${Date.now()}`)
// 完整认证验收默认启用真实 LDAP；不涉及 LDAP 的定向测试可显式关闭该前置。
const ldapEnabled = process.env.IAM_FIXTURE_LDAP !== '0'

/**
 * Admin Console - Playwright E2E 测试配置
 *
 * 使用本地安装的 Chrome 浏览器，无需额外下载 Chromium
 */
export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/debug-login.spec.ts', '**/transport-on.spec.ts', '**/auth-error-security.spec.ts'],
  globalTeardown: './e2e/global-teardown.ts',
  metadata: { notificationFixture: true },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // 每个用例拥有独立用户和浏览器上下文，限制并发以控制 SQLite 写入压力。
  workers: 2,
  reporter: 'list',
  timeout: 30_000,

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
    command: 'node e2e/notification-fixture.mjs',
    env: { IAM_FIXTURE_LDAP: ldapEnabled ? '1' : '0' },
    url: 'http://127.0.0.1:12580',
    reuseExistingServer: false,
    timeout: 90_000,
  }, {
    command: `pnpm build && pnpm exec vite preview --host ${previewHost} --port ${previewPort} --strictPort`,
    env: createE2eServerEnv({
      HAI_DB: JSON.stringify({ type: 'sqlite', database: `${testDataDir}/admin.db` }),
      HAI_CACHE: JSON.stringify({ type: 'memory' }),
      HAI_STORAGE: JSON.stringify({ type: 'local', root: `${testDataDir}/uploads` }),
      HAI_E2E: '1',
      // 测试数据目录使用独立本地后端，不继承生产 Compose 服务地址。
      HAI_DB_TYPE: 'sqlite',
      HAI_CACHE_TYPE: 'memory',
      HAI_STORAGE_TYPE: 'local',
      HAI_CORE_ENV: 'production',
      // LDAP 是可选 YAML 字段，使用整个 IAM 对象覆盖并保留本轮验收的密码/会话策略。
      HAI_IAM: JSON.stringify({
        rbac: { defaultRole: 'admin' },
        login: { password: true, otp: true, ldap: ldapEnabled },
        password: { minLength: 8, maxLength: 128, requireUppercase: false, requireLowercase: false, requireNumber: false, requireSpecialChar: false },
        session: { maxAge: 900, refreshTokenMaxAge: 604800 },
        otp: {},
        ...(ldapEnabled ? { ldap: { url: 'ldap://127.0.0.1:12583', bindDn: 'cn=admin,dc=example,dc=org', bindPassword: 'admin', searchBase: 'ou=users,dc=example,dc=org' } } : {}),
        agreements: { showOnRegister: true, showOnLogin: false, userAgreementMarkdown: '# 配置中的用户协议\n\n**注册须知**\n\n- 请保管好账户凭据。', userAgreementUrl: 'http://127.0.0.1:12580/terms', privacyPolicyUrl: 'http://127.0.0.1:12580/privacy' },
        ui: { variant: 'split', brandTitle: 'IAM flow branding', illustrationUrl: '/iam-illustration.svg' },
      }),
      HAI_REACH_PROVIDERS: JSON.stringify([{ name: 'email', type: 'api', url: 'http://127.0.0.1:12580/send' }, { name: 'sms', type: 'api', url: 'http://127.0.0.1:12580/send' }]),
      // 邮件用例显式选择 Reach；示例应用默认使用独立 Console 通知。
      HAI_FEEDBACK: JSON.stringify({ appId: 'admin-console', notificationMode: 'reach', recipients: ['feedback@example.test'], notificationProvider: 'email', adminUrl: `${baseURL}/admin/feedback` }),
      HAI_ADMIN_DEFAULT_PASSWORD: 'admin123456',
      HAI_AUDIT_ADMIN_PASSWORD: 'Audit-test-Admin123!',
      HAI_CONFIG_ADMIN_PASSWORD: 'Config-test-Admin123!',
      HAI_BUSINESS_OPERATOR_PASSWORD: 'Operator-test-Admin123!',
      HAI_DB_DATABASE: `${testDataDir}/admin.db`,
      HAI_STORAGE_ROOT: `${testDataDir}/uploads`,
      NODE_ENV: 'test',
      HAI_KIT_TRANSPORT: 'false',
    }),
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
  }],
})
