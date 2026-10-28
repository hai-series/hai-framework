/** 统一操作通知使用独立数据，验证布局、弹窗、反馈失败和恢复。 */
import { defineConfig } from '@playwright/test'
import base from './playwright.config.js'

export default defineConfig({
  ...base,
  testMatch: ['**/toast-ui.spec.ts', '**/interaction-patterns.spec.ts', '**/feedback.spec.ts'],
  grep: /浮动提示支持|列表示例的键盘|受理网络故障|默认反馈入口/,
  workers: 1,
  webServer: (Array.isArray(base.webServer) ? base.webServer : base.webServer ? [base.webServer] : []).map((server) => {
    const iam = server.env?.HAI_IAM
    if (!iam)
      return { ...server, env: { ...server.env, IAM_FIXTURE_LDAP: '0' } }
    // 本组只验证密码登录与通知；LDAP 验收继续由原配置单独装配容器。
    const config = JSON.parse(iam) as Record<string, unknown>
    return { ...server, env: { ...server.env, HAI_IAM: JSON.stringify({ ...config, login: { password: true, otp: true, ldap: false }, ldap: undefined }) } }
  }),
})
