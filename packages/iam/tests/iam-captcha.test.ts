/** 自托管轻量挑战：真实 ALTCHA 求解、用途绑定和共享缓存单次消费。 */
import { setTimeout } from 'node:timers/promises'
import { pbkdf2, solveChallenge } from 'altcha/lib'
import { expect, it } from 'vitest'
import { defineIamSuite, initIam, postgresRedisEnv, sqliteMemoryEnv, TEST_PASSWORD } from './helpers/iam-test-suite.js'

function tests() {
  const captcha = { enabled: true, cost: 100, maxCounter: 2 }
  async function createUser() {
    const iam = await initIam({ captcha })
    const username = `captcha-${crypto.randomUUID()}`
    const result = await iam.user.createUser({ username, password: TEST_PASSWORD })
    expect(result.success).toBe(true)
    return { iam, username }
  }
  async function proof(iam: Awaited<ReturnType<typeof initIam>>, operation: 'login' | 'register' | 'sendOtp' | 'passwordReset' | 'renewPassword' = 'login') {
    const created = await iam.auth.createCaptcha({ operation })
    if (!created.success)
      throw new Error(created.error.message)
    const solution = await solveChallenge({ challenge: created.data.challenge, deriveKey: pbkdf2.deriveKey, timeout: 5000 })
    expect(solution).not.toBeNull()
    return JSON.stringify({ id: created.data.id, solution })
  }

  it('默认关闭且不影响原登录，显式生成挑战返回关闭状态', async () => {
    const iam = await initIam()
    const username = `off-${crypto.randomUUID()}`
    expect((await iam.user.createUser({ username, password: TEST_PASSWORD })).success).toBe(true)
    expect(await iam.auth.createCaptcha({ operation: 'login' })).toMatchObject({ success: false, error: { code: 'hai:iam:032' } })
    expect((await iam.auth.login({ identifier: username, password: TEST_PASSWORD })).success).toBe(true)
    expect(iam.publicConfig?.captcha).toEqual({ enabled: false })
  })

  it('启用后服务端要求有效证明；正确求解可登录，秘密不进入公开配置/挑战', async () => {
    const { iam, username } = await createUser()
    expect(iam.publicConfig?.captcha).toEqual({ enabled: true })
    expect(await iam.auth.login({ identifier: username, password: TEST_PASSWORD })).toMatchObject({ success: false, error: { code: 'hai:iam:030' } })
    const created = await iam.auth.createCaptcha({ operation: 'login' })
    expect(created.success).toBe(true)
    if (created.success) {
      expect(JSON.stringify(created.data)).not.toMatch(/hmacSignatureSecret|hmacKeySignatureSecret/)
      expect(created.data.challenge.parameters.algorithm).toBe('PBKDF2/SHA-256')
    }
    const valid = await proof(iam)
    expect((await iam.auth.login({ identifier: username, password: TEST_PASSWORD, captcha: valid })).success).toBe(true)
    expect(await iam.auth.login({ identifier: username, password: TEST_PASSWORD, captcha: valid })).toMatchObject({ success: false, error: { code: 'hai:iam:031' } })
  })

  it('并发共享同一证明只允许一次鉴别尝试，密码错误也不能重用已消费挑战', async () => {
    const { iam, username } = await createUser()
    const valid = await proof(iam)
    const results = await Promise.all(Array.from({ length: 6 }, () => iam.auth.login({ identifier: username, password: TEST_PASSWORD, captcha: valid })))
    expect(results.filter(result => result.success)).toHaveLength(1)
    const next = await proof(iam)
    expect((await iam.auth.login({ identifier: username, password: 'WrongPassword123', captcha: next })).success).toBe(false)
    expect(await iam.auth.login({ identifier: username, password: TEST_PASSWORD, captcha: next })).toMatchObject({ success: false, error: { code: 'hai:iam:031' } })
  })

  it('用途、解答篡改和输入边界不绕过检查，不提前消耗合法证明', async () => {
    const { iam, username } = await createUser()
    const wrongPurpose = await proof(iam, 'register')
    expect(await iam.auth.login({ identifier: username, password: TEST_PASSWORD, captcha: wrongPurpose })).toMatchObject({ success: false, error: { code: 'hai:iam:031' } })
    const valid = await proof(iam)
    const parsed = JSON.parse(valid)
    parsed.solution.derivedKey = '00'.repeat(32)
    expect((await iam.auth.login({ identifier: username, password: TEST_PASSWORD, captcha: JSON.stringify(parsed) })).success).toBe(false)
    expect((await iam.auth.login({ identifier: username, password: TEST_PASSWORD, captcha: valid })).success).toBe(true)
    for (const malformed of ['not-json', '{}', 'x'.repeat(10000)])
      expect((await iam.auth.login({ identifier: username, password: TEST_PASSWORD, captcha: malformed })).success).toBe(false)
    expect((await iam.auth.createCaptcha({ operation: 'other' } as never)).success).toBe(false)
  })

  it('缓存有效期到达后拒绝证明，不能通过重初始化延长它', async () => {
    const { iam, username } = await createUser()
    await initIam({ captcha: { ...captcha, ttlSeconds: 1 } })
    const valid = await proof(iam)
    await initIam({ captcha })
    await setTimeout(1100)
    expect(await iam.auth.login({ identifier: username, password: TEST_PASSWORD, captcha: valid })).toMatchObject({ success: false, error: { code: 'hai:iam:031' } })
  })

  it('oTP/LDAP、注册、通知请求和匿名原密码续期均在各服务端入口执行证明检查', async () => {
    const { iam, username } = await createUser()
    const calls = [
      iam.auth.loginWithOtp({ identifier: 'alice@example.com', code: '123456' }),
      iam.auth.loginWithLdap({ username, password: TEST_PASSWORD }),
      iam.user.register({ username: `register-${crypto.randomUUID()}`, password: TEST_PASSWORD }),
      iam.auth.registerAndLogin({ username: `auth-register-${crypto.randomUUID()}`, password: TEST_PASSWORD }),
      iam.auth.sendOtp('alice@example.com'),
      iam.user.requestPasswordReset('alice@example.com'),
      iam.user.renewPassword({ identifier: username, password: TEST_PASSWORD, newPassword: 'NewPassword123!' }),
    ]
    for (const result of await Promise.all(calls))
      expect(result).toMatchObject({ success: false, error: { code: 'hai:iam:030' } })
    expect((await iam.user.renewPassword({ identifier: username, password: TEST_PASSWORD, newPassword: 'NewPassword123!', captcha: await proof(iam, 'renewPassword') })).success).toBe(true)
    expect((await iam.auth.registerAndLogin({ username: `proved-${crypto.randomUUID()}`, password: TEST_PASSWORD, captcha: await proof(iam, 'register') })).success).toBe(true)
  })
  it('通知请求保留证明，OTP 完成登录使用另一个单用证明', async () => {
    let otp = ''
    let resets = 0
    const iam = await initIam({ captcha, login: { otp: true }, otp: { email: true }, onOtpSendEmail: async (_email, code) => {
      otp = code
    }, onPasswordResetRequest: async () => {
      resets++
    } })
    const email = `captcha-${crypto.randomUUID()}@example.invalid`
    expect((await iam.user.createUser({ username: `notify-${crypto.randomUUID()}`, password: TEST_PASSWORD, email })).success).toBe(true)
    expect((await iam.auth.sendOtp(email, { captcha: await proof(iam, 'sendOtp') })).success).toBe(true)
    expect(otp).not.toBe('')
    expect((await iam.auth.loginWithOtp({ identifier: email, code: otp, captcha: await proof(iam) })).success).toBe(true)
    expect((await iam.user.requestPasswordReset(email, { captcha: await proof(iam, 'passwordReset') })).success).toBe(true)
    expect(resets).toBe(1)
  })

  it('aPI Key 机器鉴别保持原有授权语义，不要求交互证明', async () => {
    const iam = await initIam({ captcha, login: { apikey: true } })
    const user = await iam.user.createUser({ username: `machine-${crypto.randomUUID()}`, password: TEST_PASSWORD })
    if (!user.success)
      throw new Error(user.error.message)
    const key = await iam.apiKey.createApiKey(user.data.user.id, { name: 'CI automation' })
    if (!key.success)
      throw new Error(key.error.message)
    expect((await iam.auth.loginWithApiKey({ key: key.data.rawKey })).success).toBe(true)
  })
}

defineIamSuite('captcha sqlite', sqliteMemoryEnv(), tests)
defineIamSuite('captcha postgres+redis', postgresRedisEnv, tests)
