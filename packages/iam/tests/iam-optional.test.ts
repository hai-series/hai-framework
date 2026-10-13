/** 可选依赖不可加载时，密码、自定义通知和注入 LDAP 工厂仍可独立使用。 */
import type { LdapClientFactory } from '../src/index.js'
import { ok } from '@h-ai/core'
import { expect, it, vi } from 'vitest'
import { HaiIamError, iam } from '../src/index.js'
import { defineIamSuite, initIam, sqliteMemoryEnv, TEST_PASSWORD } from './helpers/iam-test-suite.js'

// 模拟未安装可选包；若 IAM 在基础认证路径导入它们，此文件会直接失败。
vi.mock('@h-ai/reach', () => {
  throw new Error('Optional Reach package unavailable')
})
vi.mock('ldapts', () => {
  throw new Error('Optional LDAP package unavailable')
})

const ldap = { url: 'ldap://localhost', bindDn: 'cn=admin', bindPassword: 'fixture-only', searchBase: 'dc=test' }

defineIamSuite('optional integrations', sqliteMemoryEnv(), () => {
  it('基础注册与密码登录不加载 Reach 或 LDAP，默认关闭目录登录', async () => {
    expect(iam.config?.login.ldap).toBe(false)
    expect(iam.publicConfig?.login).toMatchObject({ password: true, ldap: false, email: false, sms: false })
    expect(iam.publicConfig?.passwordReset.enabled).toBe(false)
    expect((await iam.auth.registerAndLogin({ username: 'optional-base', password: TEST_PASSWORD })).success).toBe(true)
    expect((await iam.auth.login({ identifier: 'optional-base', password: TEST_PASSWORD })).success).toBe(true)
  })

  it('只声明 LDAP 连接不会隐式启用或加载 SDK', async () => {
    await initIam({ ldap })
    expect(iam.publicConfig?.login.ldap).toBe(false)
    expect(await iam.auth.loginWithLdap({ username: 'directory', password: TEST_PASSWORD })).toMatchObject({ success: false, error: { code: HaiIamError.LOGIN_DISABLED.code } })
  })

  it('启用 LDAP 并注入工厂后不需要 ldapts', async () => {
    const factory: LdapClientFactory = async () => ok({
      bind: async () => ok(undefined),
      search: async () => ok([{ dn: 'uid=directory,dc=test', attributes: { uid: 'directory', mail: 'directory@example.com', cn: 'Directory user' } }]),
      unbind: async () => ok(undefined),
    })
    await initIam({ login: { ldap: true }, ldap, ldapClientFactory: factory })
    expect((await iam.auth.loginWithLdap({ username: 'directory', password: TEST_PASSWORD })).success).toBe(true)
  })

  it('显式启用 LDAP 却缺少默认 SDK 时返回初始化错误', async () => {
    await iam.close()
    const result = await iam.init({ login: { ldap: true }, ldap })
    expect(result).toMatchObject({ success: false, error: { code: HaiIamError.CONFIG_ERROR.code } })
    expect(iam.isInitialized).toBe(false)
  })

  it('自定义邮件、短信和重置通知不依赖 Reach', async () => {
    let emailCode = ''
    let smsCode = ''
    let resetToken = ''
    await initIam({
      otp: {},
      onOtpSendEmail: async (_email, code) => { emailCode = code },
      onOtpSendSms: async (_phone, code) => { smsCode = code },
      onPasswordResetRequest: async (_user, token) => { resetToken = token },
    })
    expect(iam.publicConfig?.login).toMatchObject({ email: true, sms: true })
    expect((await iam.auth.sendOtp('custom@example.com')).success).toBe(true)
    expect((await iam.auth.loginWithOtp({ identifier: 'custom@example.com', code: emailCode })).success).toBe(true)
    expect((await iam.auth.sendOtp('13800138000')).success).toBe(true)
    expect((await iam.auth.loginWithOtp({ identifier: '13800138000', code: smsCode })).success).toBe(true)
    expect((await iam.user.requestPasswordReset('custom@example.com')).success).toBe(true)
    expect((await iam.user.confirmPasswordReset(resetToken, 'ChangedPassword123')).success).toBe(true)
    expect((await iam.auth.login({ identifier: 'custom@example.com', password: 'ChangedPassword123' })).success).toBe(true)
  })
})
