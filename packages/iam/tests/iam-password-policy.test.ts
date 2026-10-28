/** 密码策略在服务端统一执行，首次/过期凭据不能取得普通会话。 */
import { afterEach, expect, it, vi } from 'vitest'
import { HaiIamError } from '../src/index.js'
import { defineIamSuite, initIam, postgresRedisEnv, sqliteMemoryEnv, TEST_PASSWORD } from './helpers/iam-test-suite.js'

function tests() {
  afterEach(() => vi.useRealTimers())

  it('字符类别数量可配置，并允许满足任意三类而非指定三类', async () => {
    const password = { requireUppercase: false, requireLowercase: false, requireNumber: false, requireSpecialChar: false }
    const iam = await initIam({ password: { ...password, minCharacterClasses: 3 } })
    expect(iam.user.validatePassword('lowercaseonly').success).toBe(false)
    expect(iam.user.validatePassword('lowercase123!').success).toBe(true)
    expect(iam.user.validatePassword('MixedCase123').success).toBe(true)
    await initIam({ password: { ...password, minCharacterClasses: 0 } })
    expect(iam.user.validatePassword('lowercaseonly').success).toBe(true)
  })

  it('过期用户可验证原密码完成更换，同密码不允许续期', async () => {
    const iam = await initIam({ password: { expirationDays: 1 } })
    const username = `expiry-${crypto.randomUUID()}`
    expect((await iam.user.register({ username, password: TEST_PASSWORD })).success).toBe(true)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 2 * 86400_000)
    expect(await iam.auth.login({ identifier: username, password: TEST_PASSWORD })).toMatchObject({ success: false, error: { code: HaiIamError.PASSWORD_EXPIRED.code } })
    expect(await iam.user.renewPassword({ identifier: username, password: TEST_PASSWORD, newPassword: TEST_PASSWORD })).toMatchObject({ success: false, error: { code: 'hai:iam:034' } })
    expect((await iam.user.renewPassword({ identifier: username, password: 'wrong', newPassword: 'NewPassword123!' })).success).toBe(false)
    expect((await iam.user.renewPassword({ identifier: username, password: TEST_PASSWORD, newPassword: 'NewPassword123!' })).success).toBe(true)
    expect((await iam.auth.login({ identifier: username, password: 'NewPassword123!' })).success).toBe(true)
  })

  it('相同密码策略可独立开关，管理员重置也不能绕过启用的策略', async () => {
    const iam = await initIam({ password: { preventSamePassword: false } })
    const username = `same-${crypto.randomUUID()}`
    const registered = await iam.user.register({ username, password: TEST_PASSWORD })
    if (!registered.success)
      throw new Error(registered.error.message)
    expect((await iam.user.changePassword(registered.data.user.id, TEST_PASSWORD, TEST_PASSWORD)).success).toBe(true)
    await initIam({ password: { preventSamePassword: true } })
    expect((await iam.user.changePassword(registered.data.user.id, TEST_PASSWORD, TEST_PASSWORD)).success).toBe(false)
    expect((await iam.user.adminResetPassword(registered.data.user.id, TEST_PASSWORD)).success).toBe(false)
  })

  it('管理员初始密码需先更换才能登录，公开自行设密账号不重复强改', async () => {
    const iam = await initIam({ password: { requireInitialChange: true } })
    const username = `initial-${crypto.randomUUID()}`
    const managed = await iam.user.createUser({ username, password: TEST_PASSWORD })
    expect(managed).toMatchObject({ success: true, data: { user: { mustChangePassword: true } } })
    expect(await iam.auth.login({ identifier: username, password: TEST_PASSWORD })).toMatchObject({ success: false, error: { code: HaiIamError.PASSWORD_CHANGE_REQUIRED.code } })
    expect(await iam.user.renewPassword({ identifier: username, password: TEST_PASSWORD, newPassword: TEST_PASSWORD })).toMatchObject({ success: false, error: { code: 'hai:iam:034' } })
    expect((await iam.user.renewPassword({ identifier: username, password: TEST_PASSWORD, newPassword: 'FirstChosen123!' })).success).toBe(true)
    expect((await iam.auth.login({ identifier: username, password: 'FirstChosen123!' })).success).toBe(true)
    expect((await iam.auth.registerAndLogin({ username: `self-${crypto.randomUUID()}`, password: TEST_PASSWORD })).success).toBe(true)
  })

  it('不存在账号和错误原密码使用同一凭据错误，不泄露字段原因', async () => {
    const iam = await initIam({ password: { requireInitialChange: true } })
    const username = `credentials-${crypto.randomUUID()}`
    expect((await iam.user.createUser({ username, password: TEST_PASSWORD })).success).toBe(true)
    const login = await iam.auth.login({ identifier: username, password: 'wrong-password' })
    const missing = await iam.user.renewPassword({ identifier: `missing-${username}`, password: TEST_PASSWORD, newPassword: 'NextPassword123!' })
    const incorrect = await iam.user.renewPassword({ identifier: username, password: 'wrong-password', newPassword: 'NextPassword123!' })
    for (const result of [login, missing, incorrect]) {
      expect(result).toMatchObject({ success: false, error: { code: HaiIamError.INVALID_CREDENTIALS.code } })
      if (!result.success) {
        expect(result.error.message).toBe('用户名或密码不正确')
        expect(result.error).not.toHaveProperty('cause')
      }
    }
  })

  it('已有会话也受密码期限约束，不能只在登录页面提示过期', async () => {
    const iam = await initIam({ password: { expirationDays: 1 }, session: { maxAge: 10 * 86400, sliding: false } })
    const login = await iam.auth.registerAndLogin({ username: `deadline-${crypto.randomUUID()}`, password: TEST_PASSWORD })
    if (!login.success)
      throw new Error(login.error.message)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 2 * 86400_000)
    expect((await iam.auth.verifyToken(login.data.tokens.accessToken)).success).toBe(false)
    expect((await iam.session.refresh(login.data.tokens.refreshToken)).success).toBe(false)
  })

  it('关闭首次改密策略后不受历史标记约束', async () => {
    const iam = await initIam({ password: { requireInitialChange: true } })
    const username = `initial-off-${crypto.randomUUID()}`
    const managed = await iam.user.createUser({ username, password: TEST_PASSWORD })
    if (!managed.success)
      throw new Error(managed.error.message)
    await initIam({ password: { requireInitialChange: false, preventSamePassword: false } })
    expect((await iam.auth.login({ identifier: username, password: TEST_PASSWORD })).success).toBe(true)
    expect((await iam.user.changePassword(managed.data.user.id, TEST_PASSWORD, TEST_PASSWORD)).success).toBe(true)
  })
}

defineIamSuite('password policy sqlite+memory', sqliteMemoryEnv(), tests)
defineIamSuite('password policy postgres+redis', postgresRedisEnv, tests)
