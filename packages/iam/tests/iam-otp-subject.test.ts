/** OTP 使用发码时已确定的联系方式与账号，首登写入用户和默认角色。 */
import { cache } from '@h-ai/cache'
import { reldb } from '@h-ai/reldb'
import { expect, it, vi } from 'vitest'
import { HaiIamError } from '../src/index.js'
import { defineIamSuite, initIam, postgresRedisEnv, sqliteMemoryEnv, TEST_PASSWORD } from './helpers/iam-test-suite.js'

function tests() {
  it('规范化联系方式定位原账号并绑定挑战，保留用户资料的原始格式', async () => {
    let emailCode = ''
    let phoneCode = ''
    const iam = await initIam({
      otp: {},
      onOtpSendEmail: async (_identifier, code) => { emailCode = code },
      onOtpSendSms: async (_identifier, code) => { phoneCode = code },
    })
    const registered = await iam.user.register({
      username: 'otp-contact-owner',
      email: 'Alice@Example.invalid',
      phone: '+86 139-0013-9001',
      password: TEST_PASSWORD,
    })
    if (!registered.success)
      throw new Error(registered.error.message)
    const user = registered.data.user

    expect((await iam.auth.sendOtp('ALICE@example.invalid')).success).toBe(true)
    const challenge = await cache.kv.get<{ subject: { userId: string } }>('hai:iam:otp:alice@example.invalid')
    expect(challenge).toMatchObject({
      success: true,
      data: {
        subject: {
          userId: user.id,
          credentialVersion: expect.any(String),
        },
      },
    })
    expect(await iam.auth.loginWithOtp({ identifier: 'alice@example.invalid', code: emailCode })).toMatchObject({
      success: true,
      data: {
        user: { id: user.id, email: user.email },
      },
    })

    expect((await iam.auth.sendOtp('+8613900139001')).success).toBe(true)
    expect(await iam.auth.loginWithOtp({ identifier: '+86 13900139001', code: phoneCode })).toMatchObject({
      success: true,
      data: {
        user: { id: user.id, phone: user.phone },
      },
    })
  })

  it('同一规范化联系方式存在多个账号时不发布挑战', async () => {
    const send = vi.fn(async () => {})
    const iam = await initIam({ otp: {}, onOtpSendSms: send })
    expect((await iam.user.register({ username: 'duplicate-phone-1', password: TEST_PASSWORD, phone: '+86 138-0013-8000' })).success).toBe(true)
    expect((await iam.user.register({ username: 'duplicate-phone-2', password: TEST_PASSWORD })).success).toBe(true)
    const legacy = await reldb.sql.execute('UPDATE hai_iam_users SET phone = ? WHERE username = ?', ['+8613800138000', 'duplicate-phone-2'])
    expect(legacy.success).toBe(true)

    expect(await iam.auth.sendOtp('+8613800138000')).toMatchObject({
      success: false,
      error: { code: HaiIamError.OTP_INVALID.code },
    })
    expect(send).not.toHaveBeenCalled()
  })

  it('注册挑战明确标记首次注册，默认角色不可用时不保留用户', async () => {
    let code = ''
    const iam = await initIam({
      otp: {},
      rbac: { enabled: true, defaultRole: 'unavailable-default-otp-role' },
      onOtpSendEmail: async (_identifier, value) => { code = value },
    })
    const identifier = 'otp-unavailable-role@example.invalid'
    expect((await iam.auth.sendOtp(identifier)).success).toBe(true)
    expect(await cache.kv.get(`hai:iam:otp:${identifier}`)).toMatchObject({
      success: true,
      data: { subject: null },
    })
    expect(await iam.auth.loginWithOtp({ identifier, code })).toMatchObject({
      success: false,
      error: { code: HaiIamError.ROLE_NOT_FOUND.code },
    })
    expect(await iam.user.listUsers({ search: identifier })).toMatchObject({
      success: true,
      data: { items: [] },
    })
  })
}

defineIamSuite('OTP 主体绑定 sqlite+memory', sqliteMemoryEnv(), tests)
defineIamSuite('OTP 主体绑定 postgres+redis', postgresRedisEnv, tests)
