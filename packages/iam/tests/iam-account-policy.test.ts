/** 账号类型、状态与闲置扫描覆盖已有会话，不能只检查登录表单。 */
import { reldb } from '@h-ai/reldb'
import { afterEach, expect, it, vi } from 'vitest'
import { HaiIamError } from '../src/index.js'
import { defineIamSuite, initIam, postgresRedisEnv, sqliteMemoryEnv, TEST_PASSWORD } from './helpers/iam-test-suite.js'

function tests() {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('默认长期账号激活，临时账号必须有有效的到期时间', async () => {
    const iam = await initIam()
    const permanent = await iam.user.createUser({ username: `permanent-${crypto.randomUUID()}`, password: TEST_PASSWORD })
    expect(permanent).toMatchObject({ success: true, data: { user: { accountType: 'permanent', accountStatus: 'active' } } })
    expect((await iam.user.createUser({ username: `invalid-${crypto.randomUUID()}`, password: TEST_PASSWORD, accountType: 'temporary' })).success).toBe(false)
  })

  it('注册默认休眠由服务端决定，管理员创建不受该默认状态影响', async () => {
    const iam = await initIam({ register: { enabled: true, defaultAccountStatus: 'dormant' } })
    const username = `pending-${crypto.randomUUID()}`
    const pending = await iam.user.register({ username, password: TEST_PASSWORD, accountStatus: 'active' })
    expect(pending).toMatchObject({ success: true, data: { user: { accountStatus: 'dormant' } } })
    expect((await iam.auth.login({ identifier: username, password: TEST_PASSWORD })).success).toBe(false)
    const managed = await iam.user.createUser({ username: `managed-${crypto.randomUUID()}`, password: TEST_PASSWORD })
    expect(managed).toMatchObject({ success: true, data: { user: { accountStatus: 'active' } } })
    if (!pending.success)
      throw new Error(pending.error.message)
    expect((await iam.user.updateUser(pending.data.user.id, { accountStatus: 'active' })).success).toBe(true)
    expect((await iam.auth.login({ identifier: username, password: TEST_PASSWORD })).success).toBe(true)
  })

  it('保存资料和相同生命周期不会撤销现有会话', async () => {
    const iam = await initIam()
    const login = await iam.auth.registerAndLogin({ username: `profile-${crypto.randomUUID()}`, password: TEST_PASSWORD })
    if (!login.success)
      throw new Error(login.error.message)
    const version = await reldb.sql.get('SELECT credential_version FROM hai_iam_users WHERE id = ?', [login.data.user.id])
    expect((await iam.user.updateUser(login.data.user.id, { displayName: 'Updated profile', accountStatus: 'active', accountType: 'permanent', accountExpiresAt: null })).success).toBe(true)
    expect(await reldb.sql.get('SELECT credential_version FROM hai_iam_users WHERE id = ?', [login.data.user.id])).toEqual(version)
    expect((await iam.auth.verifyToken(login.data.tokens.accessToken)).success).toBe(true)
  })

  it.each(['active', 'dormant', 'closed'] as const)('管理员可重置 %s 账号密码，保留状态并要求修改临时密码', async (accountStatus) => {
    const iam = await initIam({ password: { requireInitialChange: true } })
    const username = `reset-${crypto.randomUUID()}`
    const created = await iam.user.createUser({ username, password: TEST_PASSWORD, accountStatus })
    if (!created.success)
      throw new Error(created.error.message)
    const temporaryPassword = `Reset-Aa1!${crypto.randomUUID()}`
    expect((await iam.user.adminResetPassword(created.data.user.id, temporaryPassword)).success).toBe(true)
    expect(await iam.user.getUser(created.data.user.id)).toMatchObject({ success: true, data: { accountStatus, mustChangePassword: true } })
    expect((await iam.auth.login({ identifier: username, password: temporaryPassword })).success).toBe(false)
    expect((await iam.user.updateUser(created.data.user.id, { accountStatus: 'active' })).success).toBe(true)
    const login = await iam.auth.login({ identifier: username, password: temporaryPassword })
    expect(login.success).toBe(false)
    if (!login.success)
      expect(login.error.code).toBe(HaiIamError.PASSWORD_CHANGE_REQUIRED.code)
  })

  it('部分更新的 undefined 保留临时到期时间，显式 null 仍不能取消临时账号到期', async () => {
    const iam = await initIam()
    const expiry = new Date(Date.now() + 3600000)
    const created = await iam.user.createUser({ username: `partial-${crypto.randomUUID()}`, password: TEST_PASSWORD, accountType: 'temporary', accountExpiresAt: expiry })
    if (!created.success)
      throw new Error(created.error.message)
    expect(await iam.user.updateUser(created.data.user.id, { accountStatus: 'dormant', accountExpiresAt: undefined })).toMatchObject({ success: true, data: { accountType: 'temporary', accountStatus: 'dormant', accountExpiresAt: expiry } })
    expect((await iam.user.updateUser(created.data.user.id, { accountExpiresAt: null })).success).toBe(false)
    expect((await iam.user.updateUser(created.data.user.id, { accountType: undefined, accountExpiresAt: null })).success).toBe(false)
    expect(await iam.user.getUser(created.data.user.id)).toMatchObject({ success: true, data: { accountType: 'temporary', accountStatus: 'dormant', accountExpiresAt: expiry } })
  })

  it('临时账号到期后不能登录、验证旧会话或刷新', async () => {
    const iam = await initIam()
    const username = `temporary-${crypto.randomUUID()}`
    const created = await iam.user.createUser({ username, password: TEST_PASSWORD, accountType: 'temporary', accountExpiresAt: new Date(Date.now() + 60_000) })
    expect(created.success).toBe(true)
    const login = await iam.auth.login({ identifier: username, password: TEST_PASSWORD })
    if (!login.success)
      throw new Error(login.error.message)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 60_001)
    expect((await iam.auth.login({ identifier: username, password: TEST_PASSWORD })).success).toBe(false)
    expect((await iam.auth.verifyToken(login.data.tokens.accessToken)).success).toBe(false)
    expect((await iam.session.refresh(login.data.tokens.refreshToken)).success).toBe(false)
  })

  it.each(['dormant', 'closed'] as const)('账号转为%s后旧凭据失效，管理员重新激活也不复活旧会话', async (accountStatus) => {
    const iam = await initIam()
    const username = `status-${crypto.randomUUID()}`
    const login = await iam.auth.registerAndLogin({ username, password: TEST_PASSWORD })
    if (!login.success)
      throw new Error(login.error.message)
    const changed = await iam.user.updateUser(login.data.user.id, { accountStatus })
    expect(changed).toMatchObject({ success: true, data: { accountStatus } })
    expect((await iam.auth.verifyToken(login.data.tokens.accessToken)).success).toBe(false)
    expect((await iam.auth.login({ identifier: username, password: TEST_PASSWORD })).success).toBe(false)
    expect((await iam.user.updateUser(login.data.user.id, { accountStatus: 'active' })).success).toBe(true)
    expect((await iam.auth.verifyToken(login.data.tokens.accessToken)).success).toBe(false)
    expect((await iam.auth.login({ identifier: username, password: TEST_PASSWORD })).success).toBe(true)
  })

  it('闲置扫描默认关闭，启用后按最后成功登录时间休眠并撤销凭据', async () => {
    const iam = await initIam()
    const username = `scan-${crypto.randomUUID()}`
    const login = await iam.auth.registerAndLogin({ username, password: TEST_PASSWORD })
    if (!login.success)
      throw new Error(login.error.message)
    expect((await iam.user.getUser(login.data.user.id))).toMatchObject({ success: true, data: { lastLoginAt: expect.any(Date) } })
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 91 * 86400_000)
    expect(await iam.user.scanInactiveAccounts()).toEqual({ success: true, data: 0 })
    await initIam({ accounts: { dormantAfterDays: 90, scanIntervalSeconds: 3600 } })
    const scanned = await iam.user.scanInactiveAccounts()
    expect(scanned.success && scanned.data).toBeGreaterThanOrEqual(1)
    expect(await iam.user.getUser(login.data.user.id)).toMatchObject({ success: true, data: { accountStatus: 'dormant' } })
    expect((await iam.auth.login({ identifier: username, password: TEST_PASSWORD })).success).toBe(false)
  })

  it('成功登录更新时间，未使用阈值不受单次失败登录影响', async () => {
    const iam = await initIam({ accounts: { dormantAfterDays: 90 } })
    const username = `recent-${crypto.randomUUID()}`
    const created = await iam.user.register({ username, password: TEST_PASSWORD })
    expect(created.success).toBe(true)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 89 * 86400_000)
    expect((await iam.auth.login({ identifier: username, password: TEST_PASSWORD })).success).toBe(true)
    vi.setSystemTime(Date.now() + 2 * 86400_000)
    await iam.auth.login({ identifier: username, password: 'wrong' })
    expect((await iam.user.scanInactiveAccounts()).success).toBe(true)
    expect((await iam.auth.login({ identifier: username, password: TEST_PASSWORD })).success).toBe(true)
  })

  it('状态更新出现底层异常时回滚并释放事务，旧账号仍可继续使用', async () => {
    const iam = await initIam()
    const username = `rollback-${crypto.randomUUID()}`
    const created = await iam.user.register({ username, password: TEST_PASSWORD })
    if (!created.success)
      throw new Error(created.error.message)
    const begin = reldb.tx.begin.bind(reldb.tx)
    vi.spyOn(reldb.tx, 'begin').mockImplementationOnce(async () => {
      const result = await begin()
      if (result.success) {
        const execute = result.data.execute.bind(result.data)
        result.data.execute = (sql, params) => {
          if (sql.includes('SET credential_version'))
            throw new Error('Synthetic transaction write failure')
          return execute(sql, params)
        }
      }
      return result
    })
    expect((await iam.user.updateUser(created.data.user.id, { accountStatus: 'dormant' })).success).toBe(false)
    expect(await iam.user.getUser(created.data.user.id)).toMatchObject({ success: true, data: { accountStatus: 'active' } })
    expect((await iam.auth.login({ identifier: username, password: TEST_PASSWORD })).success).toBe(true)
  })

  it('配额拒绝的登录不更新成功登录时间，也不能推迟自动休眠', async () => {
    const iam = await initIam({ accounts: { dormantAfterDays: 90 }, session: { maxSessions: 1 } })
    const username = `quota-inactivity-${crypto.randomUUID()}`
    const login = await iam.auth.registerAndLogin({ username, password: TEST_PASSWORD })
    if (!login.success)
      throw new Error(login.error.message)
    const past = new Date(Date.now() - 89 * 86400_000)
    expect((await reldb.sql.execute('UPDATE hai_iam_users SET last_login_at = ? WHERE id = ?', [reldb.config?.type === 'sqlite' ? past.getTime() : past, login.data.user.id])).success).toBe(true)
    expect((await iam.auth.login({ identifier: username, password: TEST_PASSWORD })).success).toBe(false)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 2 * 86400_000)
    expect((await iam.user.scanInactiveAccounts()).success).toBe(true)
    expect(await iam.user.getUser(login.data.user.id)).toMatchObject({ success: true, data: { accountStatus: 'dormant' } })
  })

  it('自动扫描按配置周期执行，close 后不再扫描', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    const now = Date.now()
    vi.setSystemTime(now - 91 * 86400_000)
    const iam = await initIam({ accounts: { dormantAfterDays: 90, scanIntervalSeconds: 60 } })
    const created = await iam.user.register({ username: `automatic-${crypto.randomUUID()}`, password: TEST_PASSWORD })
    if (!created.success)
      throw new Error(created.error.message)
    const scan = vi.spyOn(iam.user, 'scanInactiveAccounts')
    vi.setSystemTime(now)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(scan).toHaveBeenCalledOnce()
    await scan.mock.results[0]!.value
    expect(await iam.user.getUser(created.data.user.id)).toMatchObject({ success: true, data: { accountStatus: 'dormant' } })
    await iam.close()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(scan).toHaveBeenCalledOnce()
  })
}

defineIamSuite('account policy sqlite+memory', sqliteMemoryEnv(), tests)
defineIamSuite('account policy postgres+redis', postgresRedisEnv, tests)
