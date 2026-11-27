/** 共享缓存原子更新账号失败窗口与锁定期限。 */
import { cache, HaiCacheError } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { crypto as haiCrypto } from '@h-ai/crypto'
import { reldb } from '@h-ai/reldb'
import { afterEach, expect, it, vi } from 'vitest'
import { recordLoginFailure } from '../src/authn/iam-authn-utils.js'
import { HaiIamError } from '../src/index.js'
import { createDbUserRepository } from '../src/user/iam-user-repository-user.js'
import { defineIamSuite, expectAccountLocked, initIam, loginFailureKey, postgresRedisEnv, readLoginFailures, readLoginLockoutVersion, sqliteMemoryEnv, TEST_PASSWORD } from './helpers/iam-test-suite.js'

const invalidCredentials = {
  success: false,
  error: { code: HaiIamError.INVALID_CREDENTIALS.code },
}

function tests() {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('固定24小时窗口内计数，窗口到期后从第一次失败重计', async () => {
    const iam = await initIam({
      security: { maxLoginAttempts: 3, lockoutDuration: 1200, failureWindow: 86400 },
    })
    const username = `window-${crypto.randomUUID()}`
    const registered = await iam.user.register({ username, password: TEST_PASSWORD })
    if (!registered.success)
      throw new Error(registered.error.message)
    vi.useFakeTimers({
      toFake: ['Date'],
    })
    const start = Date.now()
    const loginWithWrongPassword = () => iam.auth.login({ identifier: username, password: 'wrong' })
    expect(await loginWithWrongPassword()).toMatchObject(invalidCredentials)
    vi.setSystemTime(start + 86399_000)
    expect(await loginWithWrongPassword()).toMatchObject(invalidCredentials)
    expect(await readLoginFailures(registered.data.user.id)).toMatchObject({
      count: 2,
      firstFailedAt: start,
      lastFailedAt: start + 86399_000,
      lockedUntil: null,
    })
    vi.setSystemTime(start + 86400_000)
    expect(await loginWithWrongPassword()).toMatchObject(invalidCredentials)
    expect(await readLoginFailures(registered.data.user.id)).toMatchObject({
      count: 1,
      firstFailedAt: start + 86400_000,
      lockedUntil: null,
    })
    expect(await loginWithWrongPassword()).toMatchObject(invalidCredentials)
    expect(await loginWithWrongPassword()).toMatchObject(invalidCredentials)
    expect(await iam.auth.login({ identifier: username, password: TEST_PASSWORD })).toMatchObject(invalidCredentials)
    await expectAccountLocked(username)
    vi.setSystemTime(Date.now() + 1200_000)
    expect((await iam.auth.login({ identifier: username, password: TEST_PASSWORD })).success).toBe(true)
  })

  it('关闭锁定后忽略历史锁，登录和旧密码更新均可完成', async () => {
    const iam = await initIam({
      security: { maxLoginAttempts: 1, lockoutDuration: 1200 },
    })
    const username = `disabled-${crypto.randomUUID()}`
    const registered = await iam.user.register({ username, password: TEST_PASSWORD })
    if (!registered.success)
      throw new Error(registered.error.message)
    expect(await iam.auth.login({ identifier: username, password: 'wrong' })).toMatchObject(invalidCredentials)
    const oldState = await readLoginFailures(registered.data.user.id)
    expect(oldState?.lockedUntil).toBeGreaterThan(Date.now())
    await initIam({
      security: { lockoutEnabled: false, maxLoginAttempts: 1 },
    })
    expect((await iam.auth.login({ identifier: username, password: TEST_PASSWORD })).success).toBe(true)
    expect(await iam.auth.login({ identifier: username, password: 'wrong' })).toMatchObject(invalidCredentials)
    expect(await readLoginFailures(registered.data.user.id)).toEqual(oldState)
    expect((await iam.user.renewPassword({ identifier: username, password: TEST_PASSWORD, newPassword: 'NewPassword123!' })).success).toBe(true)
    expect(await iam.auth.login({ identifier: username, password: 'wrong' })).toMatchObject(invalidCredentials)
    expect((await iam.auth.login({ identifier: username, password: 'NewPassword123!' })).success).toBe(true)
  })

  it('并发失败不丢计数，也不会在阈值前锁定', async () => {
    const iam = await initIam({
      security: { maxLoginAttempts: 5, lockoutDuration: 1200 },
    })
    const registered = await iam.user.register({ username: `atomic-${crypto.randomUUID()}`, password: TEST_PASSWORD })
    if (!registered.success)
      throw new Error(registered.error.message)
    const repository = await createDbUserRepository()
    const user = await repository.findById(registered.data.user.id)
    if (!user.success || !user.data)
      throw new Error('Expected a stored account for the counter assertion')
    const storedUser = user.data
    const policy = { maxLoginAttempts: 5, lockoutDuration: 1200, failureWindow: 86400 }
    const first = await Promise.all(Array.from({ length: 4 }, () => recordLoginFailure(storedUser, policy)))
    expect(first.every(result => result.success)).toBe(true)
    expect(await readLoginFailures(storedUser.id)).toMatchObject({ count: 4, lockedUntil: null })
    const last = await Promise.all(Array.from({ length: 5 }, () => recordLoginFailure(storedUser, policy)))
    expect(last.every(result => result.success)).toBe(true)
    const state = await readLoginFailures(storedUser.id)
    expect(state?.count).toBe(5)
    expect(state?.lockedUntil).toBeGreaterThan(Date.now() + 1190_000)
    const key = loginFailureKey(storedUser.id, await readLoginLockoutVersion(storedUser.id))
    const ttl = await cache.kv.ttl(key)
    if (!ttl.success)
      throw new Error(ttl.error.message)
    expect(ttl.data).toBeGreaterThan(1190)
    expect(ttl.data).toBeLessThanOrEqual(1200)
  })

  it('输错密码只写入共享缓存，鉴别成功删除失败计数', async () => {
    const iam = await initIam()
    const username = `cache-write-${crypto.randomUUID()}`
    const registered = await iam.user.register({ username, password: TEST_PASSWORD })
    if (!registered.success)
      throw new Error(registered.error.message)
    const userId = registered.data.user.id
    expect(await readLoginLockoutVersion(userId)).toBe('initial')
    const columns = await reldb.schemaColumns('hai_iam_users')
    expect(columns.success).toBe(true)
    if (!columns.success)
      throw new Error(columns.error.message)
    expect(columns.data).toContain('login_lockout_version')
    for (const field of [
      'login_failed_count',
      'first_login_failed_at',
      'last_login_failed_at',
      'locked_until',
    ])
      expect(columns.data).not.toContain(field)

    const write = vi.spyOn(reldb.sql, 'execute')
    const begin = vi.spyOn(reldb.tx, 'begin')
    expect(await iam.auth.login({ identifier: username, password: 'wrong' })).toMatchObject(invalidCredentials)
    expect(write).not.toHaveBeenCalled()
    expect(begin).not.toHaveBeenCalled()
    expect(await readLoginFailures(userId)).toMatchObject({
      revision: expect.any(String),
      count: 1,
      firstFailedAt: expect.any(Number),
      lastFailedAt: expect.any(Number),
      lockedUntil: null,
    })
    expect((await iam.auth.login({ identifier: username, password: TEST_PASSWORD })).success).toBe(true)
    expect(await readLoginFailures(userId)).toBeNull()
  })

  it('锁定缓存读取和 CAS 故障拒绝鉴别，恢复后可登录', async () => {
    const iam = await initIam()
    const username = `cache-fault-${crypto.randomUUID()}`
    const registered = await iam.user.register({ username, password: TEST_PASSWORD })
    if (!registered.success)
      throw new Error(registered.error.message)
    const userId = registered.data.user.id
    const key = loginFailureKey(userId, await readLoginLockoutVersion(userId))
    const failure = core.err(HaiCacheError.OPERATION_FAILED, 'Simulated lockout cache failure')
    const failed = {
      success: false,
      error: { code: HaiIamError.REPOSITORY_ERROR.code },
    }
    const login = (password: string) => iam.auth.login({ identifier: username, password })

    const get = cache.kv.get.bind(cache.kv)
    const read = vi.spyOn(cache.kv, 'get').mockImplementation(address =>
      address === key
        ? Promise.resolve(failure)
        : get(address))
    expect(await login(TEST_PASSWORD)).toMatchObject(failed)
    read.mockRestore()

    expect(await login('wrong')).toMatchObject(invalidCredentials)
    const before = await readLoginFailures(userId)
    expect(before?.count).toBe(1)
    const compareAndSwap = cache.kv.compareAndSwap.bind(cache.kv)
    const write = vi.spyOn(cache.kv, 'compareAndSwap').mockImplementation((address, ...args) =>
      address === key
        ? Promise.resolve(failure)
        : compareAndSwap(address, ...args))
    expect(await login('wrong')).toMatchObject(failed)
    expect(await login(TEST_PASSWORD)).toMatchObject(failed)
    expect(await readLoginFailures(userId)).toEqual(before)
    write.mockRestore()

    expect((await login(TEST_PASSWORD)).success).toBe(true)
    expect(await readLoginFailures(userId)).toBeNull()
  })

  it('验证密码成功时仍拒绝同时到达的账号锁定', async () => {
    const iam = await initIam({
      security: { maxLoginAttempts: 1 },
    })
    const username = `concurrent-lock-${crypto.randomUUID()}`
    expect((await iam.user.register({ username, password: TEST_PASSWORD })).success).toBe(true)
    const started = Promise.withResolvers<void>()
    const proceed = Promise.withResolvers<void>()
    const verify = haiCrypto.password.verifyAsync.bind(haiCrypto.password)
    vi.spyOn(haiCrypto.password, 'verifyAsync').mockImplementationOnce(async (...args) => {
      const result = await verify(...args)
      started.resolve()
      await proceed.promise
      return result
    })

    const valid = iam.auth.login({ identifier: username, password: TEST_PASSWORD })
    try {
      await Promise.race([
        started.promise,
        valid.then(() => { throw new Error('Expected password verification to be in flight') }),
      ])
      expect(await iam.auth.login({ identifier: username, password: 'wrong' })).toMatchObject(invalidCredentials)
      await expectAccountLocked(username)
      proceed.resolve()
      expect(await valid).toMatchObject(invalidCredentials)
      await expectAccountLocked(username)
    }
    finally {
      proceed.resolve()
      await valid
    }
  })

  it('确认密码重置后改用新的锁定版本，旧记录不会阻止新凭据', async () => {
    let resetToken = ''
    const iam = await initIam({
      security: { maxLoginAttempts: 1 },
      onPasswordResetRequest: async (_user, token) => { resetToken = token },
    })
    const username = `reset-lock-${crypto.randomUUID()}`
    const registered = await iam.user.register({ username, email: `${username}@example.invalid`, password: TEST_PASSWORD })
    if (!registered.success)
      throw new Error(registered.error.message)
    const userId = registered.data.user.id
    const oldVersion = await readLoginLockoutVersion(userId)
    expect(await iam.auth.login({ identifier: username, password: 'wrong' })).toMatchObject(invalidCredentials)
    const oldState = await readLoginFailures(userId, oldVersion)
    expect(oldState?.lockedUntil).toBeGreaterThan(Date.now())

    expect((await iam.user.requestPasswordReset(username)).success).toBe(true)
    expect(resetToken).not.toBe('')
    expect(await readLoginLockoutVersion(userId)).toBe(oldVersion)
    const nextPassword = 'ResetPassword456!'
    expect((await iam.user.confirmPasswordReset(resetToken, nextPassword)).success).toBe(true)
    const nextVersion = await readLoginLockoutVersion(userId)
    expect(nextVersion).not.toBe(oldVersion)
    expect(nextVersion).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/)
    expect(await readLoginFailures(userId, nextVersion)).toBeNull()
    expect((await iam.auth.login({ identifier: username, password: nextPassword })).success).toBe(true)
    expect(await readLoginFailures(userId, oldVersion)).toEqual(oldState)
  })
}

defineIamSuite('lockout sqlite+memory', sqliteMemoryEnv(), tests)
defineIamSuite('lockout postgres+redis', postgresRedisEnv, tests)
