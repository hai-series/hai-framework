/** 首次改密和当前密码复用策略使用独立数据，沿用真实加密浏览器入口。 */
import { defineConfig } from '@playwright/test'
import { dutyAccounts } from './e2e/helpers.js'
import base from './playwright.transport-on.config.js'

export default defineConfig({
  ...base,
  testMatch: '**/auth-error-security.spec.ts',
  testIgnore: [],
  workers: 1,
  webServer: (Array.isArray(base.webServer) ? base.webServer : base.webServer ? [base.webServer] : []).map(server => ({
    ...server,
    env: server.env?.HAI_ADMIN_DEFAULT_PASSWORD
      ? { ...server.env, HAI_CONFIG_ADMIN_PASSWORD: dutyAccounts.config.password, HAI_IAM: JSON.stringify({ rbac: { defaultRole: 'admin' }, password: { requireInitialChange: true, preventSamePassword: true }, passwordReset: { enabled: true }, security: { lockoutEnabled: true, maxLoginAttempts: 5 } }) }
      : server.env,
  })),
})
