import { err } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HaiIamError, iam } from '../src/index.js'
import { defineIamSuite, postgresRedisEnv, sqliteMemoryEnv, TEST_PASSWORD } from './helpers/iam-test-suite.js'

function defineAuthorizationTests() {
  afterEach(() => vi.restoreAllMocks())

  it('缓存同步失败时读取当前授权，停用用户不能沿用旧会话', async () => {
    const user = await iam.user.createUser({ username: 'fresh-auth-user', password: TEST_PASSWORD })
    const permission = await iam.authz.createPermission({ code: 'fresh:read', name: 'Read', type: 'api' })
    expect(user.success && permission.success).toBe(true)
    if (!user.success || !permission.success)
      return
    const role = await iam.authz.createRole({ code: 'fresh-reader', name: 'Reader', permissionIds: [permission.data.id] })
    expect(role.success).toBe(true)
    if (!role.success)
      return
    expect((await iam.authz.assignRole(user.data.user.id, role.data.id)).success).toBe(true)
    const login = await iam.auth.login({ identifier: 'fresh-auth-user', password: TEST_PASSWORD })
    expect(login.success).toBe(true)
    if (!login.success)
      return
    vi.spyOn(iam.session, 'patchUserSessions').mockResolvedValue(err(HaiIamError.REPOSITORY_ERROR, 'cache unavailable'))
    expect((await iam.authz.removeRole(user.data.user.id, role.data.id)).success).toBe(true)
    const cached = await iam.session.verifyToken(login.data.tokens.accessToken)
    expect(cached.success).toBe(true)
    if (cached.success)
      expect(cached.data.permissions).toContain('fresh:read')
    const query = vi.spyOn(reldb.sql, 'query')
    const get = vi.spyOn(reldb.sql, 'get')
    const current = await iam.auth.verifyToken(login.data.tokens.accessToken)
    // 低层会话已填充当前凭据缓存；认证层只冷读一次当前授权，不能复用旧会话权限。
    expect(query).toHaveBeenCalledTimes(1)
    expect(query.mock.calls[0]?.[0]).toContain('JOIN')
    expect(get).not.toHaveBeenCalled()
    expect(current.success).toBe(true)
    if (current.success) {
      expect(current.data.permissions).not.toContain('fresh:read')
      expect(current.data.roles).not.toContain('fresh-reader')
    }
    expect((await iam.auth.verifyToken(login.data.tokens.accessToken)).success).toBe(true)
    expect(query).toHaveBeenCalledTimes(1)
    expect(get).not.toHaveBeenCalled()
    vi.spyOn(iam.session, 'deleteByUserId').mockResolvedValue(err(HaiIamError.REPOSITORY_ERROR, 'cache unavailable'))
    expect((await iam.user.updateUser(user.data.user.id, { enabled: false })).success).toBe(true)
    expect((await iam.auth.verifyToken(login.data.tokens.accessToken)).success).toBe(false)
  })

  it.each(['credential', 'authorization'] as const)('%s 缓存失效后必要数据库读取失败时拒绝，恢复后保留会话', async (failedRead) => {
    const username = `read-fail-${failedRead}`
    const user = await iam.user.createUser({ username, password: TEST_PASSWORD })
    expect(user.success).toBe(true)
    if (!user.success)
      return
    const login = await iam.auth.login({ identifier: username, password: TEST_PASSWORD })
    expect(login.success).toBe(true)
    if (!login.success)
      return
    // 通过真实安全写入口推进共享代际，避免用热缓存冒充数据库故障覆盖。
    expect((await iam.authz.createPermission({ code: `invalidate:${failedRead}`, name: 'Invalidate current state' })).success).toBe(true)
    if (failedRead === 'authorization')
      expect((await iam.session.verifyToken(login.data.tokens.accessToken)).success).toBe(true)
    const get = vi.spyOn(reldb.sql, 'get')
    const query = vi.spyOn(reldb.sql, 'query')
    if (failedRead === 'credential')
      get.mockResolvedValueOnce(err(HaiIamError.REPOSITORY_ERROR, 'persistent user unavailable'))
    else query.mockResolvedValueOnce(err(HaiIamError.REPOSITORY_ERROR, 'current authorization unavailable'))
    const current = await iam.auth.verifyToken(login.data.tokens.accessToken)
    expect(current.success).toBe(false)
    if (!current.success)
      expect(current.error.code).toBe(HaiIamError.REPOSITORY_ERROR.code)
    expect(get).toHaveBeenCalledTimes(failedRead === 'credential' ? 1 : 0)
    expect(query).toHaveBeenCalledTimes(failedRead === 'authorization' ? 1 : 0)
    get.mockRestore()
    query.mockRestore()
    // 暂时的持久读取故障不能删除仍有效的会话；恢复后同一令牌仍可验证。
    expect((await iam.auth.verifyToken(login.data.tokens.accessToken)).success).toBe(true)
  })

  it('可信热缓存允许数据库暂时不可用，授权失效后必要读取失败不回退会话快照', async () => {
    const user = await iam.user.createUser({ username: 'fresh-failure-user', password: TEST_PASSWORD })
    expect(user.success).toBe(true)
    const login = await iam.auth.login({ identifier: 'fresh-failure-user', password: TEST_PASSWORD })
    expect(login.success).toBe(true)
    if (!login.success)
      return
    expect((await iam.auth.verifyToken(login.data.tokens.accessToken)).success).toBe(true)
    const warm = vi.spyOn(reldb.sql, 'query').mockResolvedValue(err(HaiIamError.REPOSITORY_ERROR, 'database unavailable'))
    expect((await iam.auth.verifyToken(login.data.tokens.accessToken)).success).toBe(true)
    expect(warm).not.toHaveBeenCalled()
    warm.mockRestore()
    expect((await iam.authz.createPermission({ code: 'invalidate:authorization-failure', name: 'Invalidate authorization' })).success).toBe(true)
    expect((await iam.session.verifyToken(login.data.tokens.accessToken)).success).toBe(true)
    const cold = vi.spyOn(reldb.sql, 'query').mockResolvedValue(err(HaiIamError.REPOSITORY_ERROR, 'database unavailable'))
    expect((await iam.auth.verifyToken(login.data.tokens.accessToken)).success).toBe(false)
    expect(cold).toHaveBeenCalledTimes(1)
  })

  it('角色筛选在分页前执行，批量查询保持顺序、去重且隐藏安全字段', async () => {
    const role = await iam.authz.createRole({ code: 'batch-reader', name: 'Reader' })
    expect(role.success).toBe(true)
    if (!role.success)
      return
    const ids: string[] = []
    for (let index = 0; index < 3; index++) {
      const user = await iam.user.createUser({ username: `batch-user-${index}`, password: TEST_PASSWORD })
      expect(user.success).toBe(true)
      if (!user.success)
        return
      ids.push(user.data.user.id)
      if (index < 2)
        expect((await iam.authz.assignRole(user.data.user.id, role.data.id)).success).toBe(true)
    }
    const page = await iam.user.listUsers({ search: 'batch-user-', roleCode: 'batch-reader', page: 2, pageSize: 1 })
    expect(page.success).toBe(true)
    if (page.success) {
      expect(page.data.total).toBe(2)
      expect(page.data.items).toHaveLength(1)
      expect(page.data.page).toBe(2)
    }
    const query = vi.spyOn(reldb.sql, 'query')
    const users = await iam.user.getUsers([ids[1]!, ids[0]!, ids[1]!, 'missing'], { include: ['roles'] })
    expect(users.success).toBe(true)
    if (users.success) {
      expect(users.data.map(user => user.id)).toEqual([ids[1], ids[0]])
      expect(users.data[0]?.roles?.some(item => item.code === 'batch-reader')).toBe(true)
      expect(users.data[0]).not.toHaveProperty('passwordHash')
      expect(users.data[0]).not.toHaveProperty('loginFailedCount')
    }
    // 用户批量查询一次；角色复用已有批量关系与模型查询，不随用户数量增长。
    expect(query.mock.calls).toHaveLength(3)
    expect(await iam.user.getUsers([])).toEqual({ success: true, data: [] })
    expect((await iam.user.getUsers(Array.from({ length: 1001 }, () => ids[0]!))).success).toBe(false)
  })
}

describe('current authorization and user queries', () => {
  defineIamSuite('sqlite+memory', sqliteMemoryEnv(), defineAuthorizationTests)
  defineIamSuite('postgres+redis', postgresRedisEnv, defineAuthorizationTests)
})
