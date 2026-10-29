import type { IamFunctions } from '../src/index.js'
import { audit } from '@h-ai/audit'
import { cache } from '@h-ai/cache'
import { err } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { HaiIamError } from '../src/index.js'
import { defineIamSuite, initIam, postgresRedisEnv, sqliteMemoryEnv, TEST_PASSWORD } from './helpers/iam-test-suite.js'

function tests(getIam: () => IamFunctions) {
  beforeEach(async () => {
    expect((await audit.init()).success).toBe(true)
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    await audit.close()
  })
  it('验签、操作鉴权和敏感操作命中共享缓存后不再查询数据库，撤权立即失效', async () => {
    const iam = getIam()
    const name = `cache-${crypto.randomUUID()}`
    const created = await iam.user.createUser({ username: name, password: TEST_PASSWORD })
    const permission = await iam.authz.createPermission({ code: `${name}:read`, name: 'Read' })
    expect(created.success && permission.success).toBe(true)
    if (!created.success || !permission.success)
      return
    const role = await iam.authz.createRole({ code: name, name: 'Reader', permissionIds: [permission.data.id] })
    expect(role.success).toBe(true)
    if (!role.success)
      return
    expect((await iam.authz.assignRole(created.data.user.id, role.data.id)).success).toBe(true)
    const login = await iam.auth.login({ identifier: name, password: TEST_PASSWORD })
    expect(login.success).toBe(true)
    if (!login.success)
      return
    await iam.auth.verifyToken(login.data.tokens.accessToken)
    await iam.authz.checkPermission(created.data.user.id, `${name}:read`)
    await iam.authz.getSensitiveOperations('profile.update')
    const get = vi.spyOn(reldb.sql, 'get')
    const query = vi.spyOn(reldb.sql, 'query')
    try {
      for (let index = 0; index < 5; index++) {
        expect((await iam.auth.verifyToken(login.data.tokens.accessToken)).success).toBe(true)
        expect(await iam.authz.checkPermission(created.data.user.id, `${name}:read`)).toMatchObject({ success: true, data: true })
        expect((await iam.authz.getSensitiveOperations('profile.update')).success).toBe(true)
      }
      expect(get).not.toHaveBeenCalled()
      expect(query).not.toHaveBeenCalled()
    }
    finally {
      get.mockRestore()
      query.mockRestore()
    }
    expect((await iam.authz.removeRole(created.data.user.id, role.data.id)).success).toBe(true)
    expect(await iam.authz.checkPermission(created.data.user.id, `${name}:read`)).toMatchObject({ success: true, data: false })
    expect((await iam.user.updateUser(created.data.user.id, { accountStatus: 'dormant' })).success).toBe(true)
    expect((await iam.auth.verifyToken(login.data.tokens.accessToken)).success).toBe(false)
  })

  it('调用方事务完成之前不发布缓存；提交和回滚均推进代际', async () => {
    const iam = getIam()
    const name = `tx-cache-${crypto.randomUUID()}`
    const user = await iam.user.createUser({ username: name, password: TEST_PASSWORD })
    const role = await iam.authz.createRole({ code: name, name: 'Cache role' })
    expect(user.success && role.success).toBe(true)
    if (!user.success || !role.success)
      return
    await iam.authz.getUserAuthorization(user.data.user.id)
    const begin = await reldb.tx.begin()
    expect(begin.success).toBe(true)
    if (!begin.success)
      return
    try {
      expect((await iam.authz.assignRole(user.data.user.id, role.data.id, begin.data)).success).toBe(true)
      expect((await begin.data.commit()).success).toBe(true)
    }
    finally { await begin.data.rollback() }
    expect(await iam.authz.getUserAuthorization(user.data.user.id)).toMatchObject({ success: true, data: { roles: expect.arrayContaining([name]) } })
    const other = await reldb.tx.begin()
    expect(other.success).toBe(true)
    if (!other.success)
      return
    try {
      expect((await iam.authz.removeRole(user.data.user.id, role.data.id, other.data)).success).toBe(true)
    }
    finally { expect((await other.data.rollback()).success).toBe(true) }
    expect(await iam.authz.getUserAuthorization(user.data.user.id)).toMatchObject({ success: true, data: { roles: expect.arrayContaining([name]) } })
    const revision = await cache.kv.get<{ writers: number }>('hai:iam:read_cache:revision')
    expect(revision).toMatchObject({ success: true, data: { writers: 0 } })
  })
  it('aPI Key 重复验证命中共享缓存且撤销后立即失败，不重复数据库/哈希读取', async () => {
    const iam = await initIam({ login: { apikey: true } })
    const name = `cached-key-${crypto.randomUUID()}`
    const user = await iam.user.createUser({ username: name, password: TEST_PASSWORD })
    expect(user.success).toBe(true)
    if (!user.success)
      return
    const issued = await iam.apiKey.createApiKey(user.data.user.id, { name: 'Cache fixture', scopes: ['record:read'] })
    expect(issued.success).toBe(true)
    if (!issued.success)
      return
    expect((await iam.apiKey.verifyApiKey(issued.data.rawKey)).success).toBe(true)
    const get = vi.spyOn(reldb.sql, 'get')
    const query = vi.spyOn(reldb.sql, 'query')
    try {
      for (let index = 0; index < 5; index++)
        expect((await iam.apiKey.verifyApiKey(issued.data.rawKey)).success).toBe(true)
      expect(get).not.toHaveBeenCalled()
      expect(query).not.toHaveBeenCalled()
    }
    finally {
      get.mockRestore()
      query.mockRestore()
    }
    expect((await iam.apiKey.revokeApiKey(issued.data.apiKey.id)).success).toBe(true)
    expect((await iam.apiKey.verifyApiKey(issued.data.rawKey)).success).toBe(false)
  })

  it('数据库已提交但 Redis 失效失败时保留成功和脏标记，旧角色缓存不能复活', async () => {
    const iam = getIam()
    const name = `cache-fault-${crypto.randomUUID()}`
    const user = await iam.user.createUser({ username: name, password: TEST_PASSWORD })
    const role = await iam.authz.createRole({ code: name, name: 'Fault role' })
    expect(user.success && role.success).toBe(true)
    if (!user.success || !role.success)
      return
    await iam.authz.assignRole(user.data.user.id, role.data.id)
    await iam.authz.getUserAuthorization(user.data.user.id)
    const swap = cache.kv.compareAndSwap
    const fault = vi.spyOn(cache.kv, 'compareAndSwap').mockImplementation((key, previous, next, options) => key === 'hai:iam:read_cache:revision' && next && typeof next === 'object' && 'writers' in next && next.writers === 0
      ? Promise.resolve(err(HaiIamError.REPOSITORY_ERROR, 'Injected invalidation failure'))
      : swap(key, previous, next, options))
    try {
      expect((await iam.authz.updateRole(role.data.id, { code: `${name}-updated` })).success).toBe(true)
    }
    finally { fault.mockRestore() }
    try {
      expect(await cache.kv.get('hai:iam:read_cache:revision')).toMatchObject({ success: true, data: { writers: 1 } })
      expect(await iam.authz.getUserAuthorization(user.data.user.id)).toMatchObject({ success: true, data: { roles: expect.arrayContaining([`${name}-updated`]) } })
    }
    finally {
      // 夹具内没有活动写事务；模拟维护窗口修复，不能在真实在线写入时清空栅栏。
      await cache.kv.del('hai:iam:read_cache:revision')
    }
  })
}

defineIamSuite('read cache sqlite+memory', sqliteMemoryEnv(), tests)
defineIamSuite('read cache postgres+redis', postgresRedisEnv, tests)
