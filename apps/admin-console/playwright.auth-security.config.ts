import { defineConfig } from '@playwright/test'
import { dutyAccounts } from './e2e/helpers.js'
import transportConfig from './playwright.transport-on.config.js'

/** 初始改密/禁止复用需要显式策略；与默认密码策略的普通界面验收隔离。 */
export default defineConfig({
  ...transportConfig,
  testMatch: '**/auth-error-security.spec.ts',
  workers: 1,
  webServer: (Array.isArray(transportConfig.webServer) ? transportConfig.webServer : []).map((server) => {
    if (!server.env?.HAI_IAM)
      return server
    return {
      ...server,
      env: {
        ...server.env,
        HAI_CONFIG_ADMIN_PASSWORD: dutyAccounts.config.password,
        HAI_AUDIT_ADMIN_PASSWORD: dutyAccounts.audit.password,
        HAI_BUSINESS_OPERATOR_PASSWORD: dutyAccounts.operator.password,
        HAI_IAM: JSON.stringify({
          rbac: { defaultRole: 'admin' },
          password: { requireInitialChange: true, preventSamePassword: true },
        }),
      },
    }
  }),
})
