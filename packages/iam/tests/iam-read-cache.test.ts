import type { IamFunctions } from '../src/index.js'
import { audit } from '@h-ai/audit'
import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { maintainIamReadCacheRevision } from '../src/iam-cache.js'
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
    const role = await iam.authz.createRole({
      code: name,
      name: 'Reader',
      permissionIds: [permission.data.id],
    })
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
    const revisionKey = 'hai:iam:read_cache:revision'
    const revision = await cache.kv.get<{ epoch: string }>(revisionKey)
    if (!revision.success || !revision.data)
      throw new Error('Expected a revision for the warm user access cache')
    const accessKey = `hai:iam:read_cache:${revision.data.epoch}:user_access:${created.data.user.id}`
    const readCache = vi.spyOn(cache.kv, 'get')
    const get = vi.spyOn(reldb.sql, 'get')
    const query = vi.spyOn(reldb.sql, 'query')
    try {
      for (let index = 0; index < 5; index++) {
        readCache.mockClear()
        expect((await iam.auth.verifyToken(login.data.tokens.accessToken)).success).toBe(true)
        const keys = readCache.mock.calls.map(([key]) => key).filter(key => key.startsWith('hai:iam:read_cache:'))
        expect(keys).toEqual([revisionKey, accessKey, revisionKey])
        expect(await iam.authz.checkPermission(created.data.user.id, `${name}:read`)).toMatchObject({ success: true, data: true })
        expect((await iam.authz.getSensitiveOperations('profile.update')).success).toBe(true)
      }
      expect(get).not.toHaveBeenCalled()
      expect(query).not.toHaveBeenCalled()
    }
    finally {
      readCache.mockRestore()
      get.mockRestore()
      query.mockRestore()
    }
    const result = await reldb.tx.wrapResult(tx => iam.authz.removeRole(created.data.user.id, role.data.id, tx))
    expect(result.success).toBe(true)
    const stored = await iam.session.verifyToken(login.data.tokens.accessToken)
    const current = await iam.auth.verifyToken(login.data.tokens.accessToken)
    expect(stored.success && stored.data.permissions).toContain(`${name}:read`)
    expect(current.success).toBe(true)
    expect(current.success && current.data.permissions.includes(`${name}:read`)).toBe(false)
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
    expect(await iam.authz.getUserAuthorization(user.data.user.id)).toMatchObject({
      success: true,
      data: {
        roles: expect.arrayContaining([name]),
      },
    })
    const other = await reldb.tx.begin()
    expect(other.success).toBe(true)
    if (!other.success)
      return
    try {
      expect((await iam.authz.removeRole(user.data.user.id, role.data.id, other.data)).success).toBe(true)
    }
    finally { expect((await other.data.rollback()).success).toBe(true) }
    expect(await iam.authz.getUserAuthorization(user.data.user.id)).toMatchObject({
      success: true,
      data: {
        roles: expect.arrayContaining([name]),
      },
    })
    const revision = await cache.kv.get<{ writers: number }>('hai:iam:read_cache:revision')
    expect(revision).toMatchObject({
      success: true,
      data: { writers: 0 },
    })
  })
  it('缓存复用 API Key 凭据和权限，每次检查所属账户且撤销后立即失败', async () => {
    const iam = await initIam({
      login: { apikey: true },
    })
    const name = `cached-key-${crypto.randomUUID()}`
    const user = await iam.user.createUser({ username: name, password: TEST_PASSWORD })
    expect(user.success).toBe(true)
    if (!user.success)
      return
    const issued = await iam.apiKey.createApiKey(user.data.user.id, {
      name: 'Cache fixture',
      scopes: ['record:read'],
    })
    expect(issued.success).toBe(true)
    if (!issued.success)
      return
    expect((await iam.apiKey.verifyApiKey(issued.data.rawKey)).success).toBe(true)
    const get = vi.spyOn(reldb.sql, 'get')
    const query = vi.spyOn(reldb.sql, 'query')
    try {
      for (let index = 0; index < 5; index++)
        expect((await iam.apiKey.verifyApiKey(issued.data.rawKey)).success).toBe(true)
      expect(get).toHaveBeenCalledTimes(5)
      for (const [sql] of get.mock.calls)
        expect(sql).toContain('FROM hai_iam_users WHERE id =')
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
      ? Promise.resolve(core.err(HaiIamError.REPOSITORY_ERROR, 'Injected invalidation failure'))
      : swap(key, previous, next, options))
    try {
      expect((await iam.authz.updateRole(role.data.id, { code: `${name}-updated` })).success).toBe(true)
    }
    finally { fault.mockRestore() }
    expect(await maintainIamReadCacheRevision()).toMatchObject({
      success: true,
      data: {
        writers: 1,
        activeWriters: [
          expect.objectContaining({
            id: expect.any(String),
          }),
        ],
      },
    })
    expect(await iam.authz.getUserAuthorization(user.data.user.id)).toMatchObject({
      success: true,
      data: {
        roles: expect.arrayContaining([`${name}-updated`]),
      },
    })
    await vi.waitFor(async () => {
      expect(await maintainIamReadCacheRevision()).toMatchObject({
        success: true,
        data: { writers: 0, activeWriters: [] },
      })
    }, 3000)
  })

  it('数据库提交结果未知时持续回源，核实事务结束后只通过当前代次恢复', async () => {
    const iam = getIam()
    const code = `cache-outcome-${crypto.randomUUID()}`
    const created = await iam.authz.createPermission({
      code,
      name: 'Before commit',
      sensitiveOperations: [code],
    })
    if (!created.success)
      throw new Error(created.error.message)
    expect(await iam.authz.getSensitiveOperations(code)).toEqual({
      success: true,
      data: [code],
    })
    const opened = await reldb.tx.begin()
    if (!opened.success)
      throw new Error(opened.error.message)
    const tx = opened.data
    const commit = tx.commit.bind(tx)
    tx.commit = async () => {
      const result = await commit()
      expect(result.success).toBe(true)
      return core.err(HaiIamError.REPOSITORY_ERROR, 'Test commit acknowledgement lost')
    }
    try {
      expect((await iam.authz.deletePermission(created.data.id, tx)).success).toBe(true)
      expect((await tx.commit()).success).toBe(false)
    }
    finally {
      await tx.rollback()
    }
    const stuck = await maintainIamReadCacheRevision()
    if (!stuck.success || !stuck.data.epoch)
      throw new Error('Expected a cache revision')
    expect(stuck.data.writers).toBe(1)
    expect(await iam.authz.getSensitiveOperations(code)).toEqual({ success: true, data: [] })
    expect(await maintainIamReadCacheRevision('stale-epoch')).toMatchObject({
      success: false,
      error: { code: HaiIamError.CONFLICT.code },
    })
    expect(await maintainIamReadCacheRevision()).toEqual(stuck)
    // 夹具已收到数据库提交结果且没有其他写入者，模拟维护窗口退出回源模式。
    const repaired = await maintainIamReadCacheRevision(stuck.data.epoch)
    expect(repaired).toMatchObject({
      success: true,
      data: { writers: 0, activeWriters: [] },
    })
    expect(repaired.success && repaired.data.epoch).not.toBe(stuck.data.epoch)
  })
}

defineIamSuite('read cache sqlite+memory', sqliteMemoryEnv(), tests)
defineIamSuite('read cache postgres+redis', postgresRedisEnv, tests)
