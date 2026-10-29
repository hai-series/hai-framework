/** 失败计数窗口及锁定在共享数据库中原子提交，关闭策略不受旧锁影响。 */
import { reldb } from '@h-ai/reldb'
import { afterEach, expect, it, vi } from 'vitest'
import { HaiIamError } from '../src/index.js'
import { createDbUserRepository } from '../src/user/iam-user-repository-user.js'
import { defineIamSuite, expectAccountLocked, initIam, postgresRedisEnv, sqliteMemoryEnv, TEST_PASSWORD } from './helpers/iam-test-suite.js'

function tests() {
  afterEach(() => vi.useRealTimers())

  it('固定24小时窗口内计数，窗口到期后从第一次失败重计', async () => {
    const iam = await initIam({ security: { maxLoginAttempts: 3, lockoutDuration: 1200, failureWindow: 86400 } })
    const username = `window-${crypto.randomUUID()}`
    const registered = await iam.user.register({ username, password: TEST_PASSWORD })
    if (!registered.success)
      throw new Error(registered.error.message)
    vi.useFakeTimers({ toFake: ['Date'] })
    const start = Date.now()
    await iam.auth.login({ identifier: username, password: 'wrong' })
    vi.setSystemTime(start + 86399_000)
    await iam.auth.login({ identifier: username, password: 'wrong' })
    vi.setSystemTime(start + 86401_000)
    await iam.auth.login({ identifier: username, password: 'wrong' })
    const repository = await createDbUserRepository()
    expect(await repository.findById(registered.data.user.id)).toMatchObject({ success: true, data: { loginFailedCount: 1, lockedUntil: undefined } })
    await iam.auth.login({ identifier: username, password: 'wrong' })
    await iam.auth.login({ identifier: username, password: 'wrong' })
    expect(await iam.auth.login({ identifier: username, password: TEST_PASSWORD })).toMatchObject({ success: false, error: { code: HaiIamError.INVALID_CREDENTIALS.code } })
    await expectAccountLocked(username)
    vi.setSystemTime(Date.now() + 1201_000)
    expect((await iam.auth.login({ identifier: username, password: TEST_PASSWORD })).success).toBe(true)
  })

  it('关闭锁定后忽略历史锁，登录和旧密码更新均可完成', async () => {
    const iam = await initIam({ security: { maxLoginAttempts: 1, lockoutDuration: 1200 } })
    const username = `disabled-${crypto.randomUUID()}`
    const registered = await iam.user.register({ username, password: TEST_PASSWORD })
    if (!registered.success)
      throw new Error(registered.error.message)
    await iam.auth.login({ identifier: username, password: 'wrong' })
    await initIam({ security: { lockoutEnabled: false, maxLoginAttempts: 1 } })
    expect((await iam.user.renewPassword({ identifier: username, password: TEST_PASSWORD, newPassword: 'NewPassword123!' })).success).toBe(true)
    await iam.auth.login({ identifier: username, password: 'wrong' })
    expect((await iam.auth.login({ identifier: username, password: 'NewPassword123!' })).success).toBe(true)
  })

  it('并发失败不丢计数，也不会在阈值前锁定', async () => {
    const iam = await initIam({ security: { maxLoginAttempts: 5, lockoutDuration: 1200 } })
    const registered = await iam.user.register({ username: `atomic-${crypto.randomUUID()}`, password: TEST_PASSWORD })
    if (!registered.success)
      throw new Error(registered.error.message)
    const repository = await createDbUserRepository()
    const policy = { maxLoginAttempts: 5, lockoutDuration: 1200, failureWindow: 86400 }
    const first = await Promise.all(Array.from({ length: 4 }, () => repository.recordLoginFailure(registered.data.user.id, policy)))
    expect(first.every(result => result.success)).toBe(true)
    expect(await repository.findById(registered.data.user.id)).toMatchObject({ success: true, data: { loginFailedCount: 4, lockedUntil: undefined } })
    const last = await Promise.all(Array.from({ length: 5 }, () => repository.recordLoginFailure(registered.data.user.id, policy)))
    expect(last.every(result => result.success)).toBe(true)
    const stored = await repository.findById(registered.data.user.id)
    expect(stored).toMatchObject({ success: true, data: { loginFailedCount: 5 } })
    if (stored.success)
      expect(stored.data?.lockedUntil!.getTime()).toBeGreaterThan(Date.now() + 1190_000)
    // 确认实际持久化，而非各节点进程内计数。
    expect((await reldb.sql.query('SELECT login_failed_count FROM hai_iam_users WHERE id = ?', [registered.data.user.id])).success).toBe(true)
  })
}

defineIamSuite('lockout sqlite+memory', sqliteMemoryEnv(), tests)
defineIamSuite('lockout postgres+redis', postgresRedisEnv, tests)
