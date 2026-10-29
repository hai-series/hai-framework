/** 密码、OTP、重置的并发与配置回归，覆盖共享数据库/Redis。 */
import { cache } from '@h-ai/cache'
import { reach } from '@h-ai/reach'
import { reldb } from '@h-ai/reldb'
import { expect, it, vi } from 'vitest'
import { HaiIamError } from '../src/index.js'
import { defineIamSuite, expectAccountLocked, initIam, postgresRedisEnv, sqliteMemoryEnv, TEST_PASSWORD } from './helpers/iam-test-suite.js'

function tests() {
  it('公开配置与注册/登录结果保留 Markdown 协议，按场景开关展示', async () => {
    const agreements = { userAgreementMarkdown: '# 用户协议\n\n条款正文。', privacyPolicyMarkdown: '# 隐私政策\n\n资料用途。', userAgreementUrl: 'https://example.com/terms', showOnRegister: true, showOnLogin: true }
    const iam = await initIam({ agreements })
    expect(iam.publicConfig?.agreements).toMatchObject(agreements)
    const registered = await iam.auth.registerAndLogin({ username: 'markdown-agreement', password: TEST_PASSWORD })
    expect(registered.success).toBe(true)
    if (registered.success)
      expect(registered.data.agreements).toMatchObject(agreements)
    const login = await iam.auth.login({ identifier: 'markdown-agreement', password: TEST_PASSWORD })
    expect(login.success).toBe(true)
    if (login.success)
      expect(login.data.agreements?.privacyPolicyMarkdown).toBe(agreements.privacyPolicyMarkdown)
    await initIam({ agreements: { ...agreements, showOnLogin: false } })
    const hidden = await iam.auth.login({ identifier: 'markdown-agreement', password: TEST_PASSWORD })
    expect(hidden.success).toBe(true)
    if (hidden.success)
      expect(hidden.data.agreements).toBeUndefined()
  })
  it('通知关闭或显式回调齐全时不查询 Reach 模板，回调优先于 Reach', async () => {
    expect((await reach.init({ providers: [{ name: 'unused', type: 'console' }] })).success).toBe(true)
    const templates = vi.spyOn(reach.template, 'list')
    const email = vi.fn(async () => {})
    const sms = vi.fn(async () => {})
    const reset = vi.fn(async () => {})
    try {
      await initIam({ reach, login: { otp: false }, passwordReset: { enabled: false } })
      expect(templates).not.toHaveBeenCalled()
      const iam = await initIam({ reach, otp: {}, onOtpSendEmail: email, onOtpSendSms: sms, onPasswordResetRequest: reset })
      expect(templates).not.toHaveBeenCalled()
      expect((await iam.auth.sendOtp('override@example.com')).success).toBe(true)
      expect(email).toHaveBeenCalledOnce()
      expect((await iam.auth.sendOtp('13900139000')).success).toBe(true)
      expect(sms).toHaveBeenCalledOnce()
      expect((await iam.user.register({ username: 'override-reset', password: TEST_PASSWORD, email: 'reset-override@example.com' })).success).toBe(true)
      expect((await iam.user.requestPasswordReset('reset-override@example.com')).success).toBe(true)
      expect(reset).toHaveBeenCalledOnce()
    }
    finally {
      templates.mockRestore()
      await reach.close()
    }
  })
  it('reach 标准模板自动接入短信重置，通知异常不暴露内部详情', async () => {
    expect((await reach.init({ providers: [{ name: 'sms', type: 'console' }], templates: [{ name: 'password_reset_sms', provider: 'sms', body: 'Reset: {token}' }] })).success).toBe(true)
    const sent = vi.spyOn(reach, 'send')
    try {
      const iam = await initIam({ reach, otp: {}, passwordReset: { mode: 'phone' }, onOtpSendEmail: async () => {
        throw new Error('private-callback-detail')
      } })
      expect(iam.publicConfig?.passwordReset).toEqual({ enabled: true, mode: 'phone' })
      expect((await iam.user.register({ username: 'phone-reset', password: TEST_PASSWORD, phone: '13800138000' })).success).toBe(true)
      expect((await iam.user.requestPasswordReset('13800138000')).success).toBe(true)
      const notification = sent.mock.calls.at(-1)?.[0]
      expect(notification?.template).toBe('password_reset_sms')
      expect(notification?.to).toBe('13800138000')
      const failed = await iam.auth.sendOtp('delivery@example.com')
      expect(failed.success).toBe(false)
      if (!failed.success)
        expect(failed.error.message).not.toContain('private-callback-detail')
    }
    finally {
      sent.mockRestore()
      await reach.close()
    }
  })
  it('验证码有真实缓存 TTL，重置令牌按数据库有效期拒绝到期使用', async () => {
    let otp = ''
    let reset = ''
    const iam = await initIam({ otp: { expiresIn: 60 }, passwordReset: { tokenExpiresIn: 300 }, onOtpSendEmail: async (_id, value) => {
      otp = value
    }, onPasswordResetRequest: async (_user, value) => {
      reset = value
    } })
    expect((await iam.user.register({ username: 'expiry-user', password: TEST_PASSWORD })).success).toBe(true)
    expect((await iam.auth.sendOtp('expiry@example.com')).success).toBe(true)
    expect((await iam.user.requestPasswordReset('expiry-user')).success).toBe(true)
    const otpKey = 'hai:iam:otp:expiry@example.com'
    const otpTtl = await cache.kv.ttl(otpKey)
    expect(otpTtl.success).toBe(true)
    if (otpTtl.success)
      expect(otpTtl.data).toBeGreaterThanOrEqual(58)
    const resetExpiry = await reldb.sql.get<{ reset_expires_at: number | string }>('SELECT reset_expires_at FROM hai_iam_users WHERE username = ?', ['expiry-user'])
    expect(resetExpiry.success && Number(resetExpiry.data?.reset_expires_at)).toBeGreaterThanOrEqual(Date.now() + 298_000)
    expect((await cache.kv.expire(otpKey, 1)).success).toBe(true)
    expect((await reldb.sql.execute('UPDATE hai_iam_users SET reset_expires_at = 1 WHERE username = ?', ['expiry-user'])).success).toBe(true)
    await new Promise(resolve => setTimeout(resolve, 1200))
    expect((await iam.auth.loginWithOtp({ identifier: 'expiry@example.com', code: otp })).success).toBe(false)
    expect((await iam.user.confirmPasswordReset(reset, TEST_PASSWORD)).success).toBe(false)
  })
  it('并发错误密码准确触发锁定，到期后的失败重新开始计数', async () => {
    const iam = await initIam({ security: { maxLoginAttempts: 5, lockoutDuration: 60 } })
    const registered = await iam.user.register({ username: 'parallel-password', password: TEST_PASSWORD })
    expect(registered.success).toBe(true)
    const failures = await Promise.all(Array.from({ length: 8 }, () => iam.auth.login({ identifier: 'parallel-password', password: 'wrong' })))
    expect(failures.every(result => !result.success)).toBe(true)
    const locked = await iam.auth.login({ identifier: 'parallel-password', password: TEST_PASSWORD })
    expect(locked).toMatchObject({ success: false, error: { code: HaiIamError.INVALID_CREDENTIALS.code } })
    await expectAccountLocked('parallel-password')
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(Date.now() + 61_000)
      await iam.auth.login({ identifier: 'parallel-password', password: 'wrong' })
      const recovered = await iam.auth.login({ identifier: 'parallel-password', password: TEST_PASSWORD })
      expect(recovered.success).toBe(true)
    }
    finally { vi.useRealTimers() }
  })

  it('并发只发送一次 OTP，大小写邮箱共享间隔，消费后仍限制发送', async () => {
    let code = ''
    const send = vi.fn(async (_identifier: string, value: string) => {
      code = value
    })
    const iam = await initIam({ otp: { resendInterval: 30 }, onOtpSendEmail: send })
    const sent = await Promise.all(Array.from({ length: 6 }, () => iam.auth.sendOtp('Parallel@Example.com')))
    expect(sent.filter(result => result.success)).toHaveLength(1)
    expect(send).toHaveBeenCalledTimes(1)
    const logged = await Promise.all(Array.from({ length: 6 }, () => iam.auth.loginWithOtp({ identifier: 'parallel@example.com', code })))
    expect(logged.filter(result => result.success)).toHaveLength(1)
    const resent = await iam.auth.sendOtp('PARALLEL@example.com')
    expect(resent).toMatchObject({ success: false, error: { code: HaiIamError.OTP_RESEND_TOO_FAST.code } })
  })

  it('oTP 耗尽后正确验证码也不能登录，邮件/短信可独立关闭', async () => {
    let code = ''
    const iam = await initIam({ otp: { maxAttempts: 2, sms: false }, onOtpSendEmail: async (_id, value) => {
      code = value
    }, onOtpSendSms: vi.fn() })
    expect((await iam.auth.sendOtp('attempts@example.com')).success).toBe(true)
    const wrong = code === '000000' ? '111111' : '000000'
    await Promise.all(Array.from({ length: 5 }, () => iam.auth.loginWithOtp({ identifier: 'attempts@example.com', code: wrong })))
    expect((await iam.auth.loginWithOtp({ identifier: 'attempts@example.com', code })).success).toBe(false)
    expect(await iam.auth.sendOtp('13800138000')).toMatchObject({ success: false, error: { code: HaiIamError.LOGIN_DISABLED.code } })
    expect(iam.publicConfig?.login).toMatchObject({ email: true, sms: false })
  })

  it('oTP 自动注册遵守 defaultAccountStatus，注册可独立于密码登录开启', async () => {
    let code = ''
    const iam = await initIam({ login: { password: false }, register: { defaultAccountStatus: 'dormant' }, otp: {}, onOtpSendEmail: async (_id, value) => {
      code = value
    } })
    await iam.auth.sendOtp('pending@example.com')
    const result = await iam.auth.loginWithOtp({ identifier: 'pending@example.com', code })
    expect(result).toMatchObject({ success: false, error: { code: HaiIamError.INVALID_CREDENTIALS.code } })
    await initIam({ login: { password: false } })
    const registered = await iam.auth.registerAndLogin({ username: 'register-only', password: TEST_PASSWORD })
    expect(registered.success).toBe(true)
  })

  it('重置令牌并发仅成功一次，撤销旧会话并解除登录锁定', async () => {
    let token = ''
    const iam = await initIam({ security: { maxLoginAttempts: 1 }, onPasswordResetRequest: async (_user, value) => {
      token = value
    } })
    const registered = await iam.auth.registerAndLogin({ username: 'reset-parallel', email: 'reset-parallel@example.com', password: TEST_PASSWORD })
    expect(registered.success).toBe(true)
    await iam.auth.login({ identifier: 'reset-parallel', password: 'wrong' })
    expect((await iam.user.requestPasswordReset('reset-parallel')).success).toBe(true)
    const results = await Promise.all(Array.from({ length: 6 }, () => iam.user.confirmPasswordReset(token, 'NewPassword123')))
    expect(results.filter(result => result.success)).toHaveLength(1)
    if (registered.success)
      expect((await iam.auth.verifyToken(registered.data.tokens.accessToken)).success).toBe(false)
    expect((await iam.auth.login({ identifier: 'reset-parallel', password: 'NewPassword123' })).success).toBe(true)
  })

  it('重置密码策略失败消耗尝试次数，并遵守令牌有效期和开关', async () => {
    let token = ''
    const iam = await initIam({ passwordReset: { maxAttempts: 2, tokenExpiresIn: 300 }, onPasswordResetRequest: async (_user, value) => {
      token = value
    } })
    await iam.user.register({ username: 'reset-attempts', password: TEST_PASSWORD })
    await iam.user.requestPasswordReset('reset-attempts')
    await iam.user.confirmPasswordReset(token, 'weak')
    await iam.user.confirmPasswordReset(token, 'weak')
    expect(await iam.user.confirmPasswordReset(token, TEST_PASSWORD)).toMatchObject({ success: false, error: { code: HaiIamError.RESET_TOKEN_MAX_ATTEMPTS.code } })
    await iam.user.requestPasswordReset('reset-attempts')
    // 新代际与计数在同一用户行提交，不再依赖三个缓存键的 TTL 对齐。
    const state = await reldb.sql.get<{ reset_attempts: number, reset_hash: string }>('SELECT reset_attempts, reset_hash FROM hai_iam_users WHERE username = ?', ['reset-attempts'])
    expect(state.success && state.data).toMatchObject({ reset_attempts: 0, reset_hash: expect.any(String) })
    await initIam({ passwordReset: { enabled: false } })
    expect(await iam.user.confirmPasswordReset(token, TEST_PASSWORD)).toMatchObject({ success: false, error: { code: HaiIamError.PASSWORD_RESET_DISABLED.code } })
  })

  it('关闭自助注册后管理员仍可建用户，公开配置不暴露 LDAP 密码', async () => {
    const iam = await initIam({ register: { enabled: false }, login: { ldap: true }, ldap: { url: 'ldap://localhost', bindDn: 'cn=admin', bindPassword: 'test-only', searchBase: 'dc=test' } })
    expect((await iam.user.register({ username: 'blocked', password: TEST_PASSWORD })).success).toBe(false)
    const created = await iam.user.createUser({ username: 'admin-created', password: TEST_PASSWORD })
    expect(created.success).toBe(true)
    expect(JSON.stringify(iam.publicConfig)).not.toContain('test-only')
    expect(iam.publicConfig?.login).toMatchObject({ ldap: true, email: false, sms: false })
    expect(iam.publicConfig?.passwordReset.enabled).toBe(false)
  })
}

defineIamSuite('security sqlite+memory', sqliteMemoryEnv(), tests)
defineIamSuite('security postgres+redis', postgresRedisEnv, tests)
