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
    expect(query.mock.calls.length).toBe(2)
    expect(get.mock.calls.length).toBe(1)
    expect(current.success).toBe(true)
    if (current.success) {
      expect(current.data.permissions).not.toContain('fresh:read')
      expect(current.data.roles).not.toContain('fresh-reader')
    }
    vi.spyOn(iam.session, 'deleteByUserId').mockResolvedValue(err(HaiIamError.REPOSITORY_ERROR, 'cache unavailable'))
    expect((await iam.user.updateUser(user.data.user.id, { enabled: false })).success).toBe(true)
    expect((await iam.auth.verifyToken(login.data.tokens.accessToken)).success).toBe(false)
  })

  it('数据库失败不回退会话缓存授权', async () => {
    const user = await iam.user.createUser({ username: 'fresh-failure-user', password: TEST_PASSWORD })
    expect(user.success).toBe(true)
    const login = await iam.auth.login({ identifier: 'fresh-failure-user', password: TEST_PASSWORD })
    expect(login.success).toBe(true)
    if (!login.success)
      return
    vi.spyOn(reldb.sql, 'query').mockResolvedValue(err(HaiIamError.REPOSITORY_ERROR, 'database unavailable'))
    expect((await iam.auth.verifyToken(login.data.tokens.accessToken)).success).toBe(false)
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
