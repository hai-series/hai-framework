/** 凭据代与会话绑定：持久改密不依赖成功删除缓存，旧策略/refresh不能取得新代。 */
import { cache, HaiCacheError } from '@h-ai/cache'
import { err, ok } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { IamConfigSchema } from '../src/iam-config.js'
import { HaiIamError } from '../src/iam-types.js'
import { iam } from '../src/index.js'
import { createSessionOperations } from '../src/session/iam-session-functions.js'
import { getUserSessionScope } from '../src/session/iam-session-utils.js'
import { createDbUserRepository } from '../src/user/iam-user-repository-user.js'

beforeEach(async () => {
  expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
  expect((await cache.init({ type: 'memory' })).success).toBe(true)
  expect((await iam.init({ seedDefaultData: false, rbac: { enabled: false } })).success).toBe(true)
})
afterEach(async () => {
  vi.restoreAllMocks()
  await iam.close()
  await cache.close()
  await reldb.close()
})

it('密码SQL提交后缓存清除失败，旧access/refresh仍即时拒绝；新登录绑定新代', async () => {
  const registration = await iam.user.register({ username: 'generation_user', password: 'TestPass123' })
  if (!registration.success)
    throw new Error(registration.error.message)
  const userId = registration.data.user.id
  const login = await iam.auth.login({ identifier: 'generation_user', password: 'TestPass123' })
  if (!login.success)
    throw new Error(login.error.message)
  const access = login.data.tokens.accessToken
  const refresh = login.data.tokens.refreshToken
  const users = await createDbUserRepository()
  const snapshot = await users.findById(userId)
  if (!snapshot.success || !snapshot.data)
    throw new Error('Missing user snapshot')
  const changed = await users.setPassword({ userId, expectedVersion: snapshot.data.credentialVersion ?? '', passwordHash: snapshot.data.passwordHash! })
  expect(changed.success && changed.data).toBe(true)
  // 保留真实旧缓存，主动注入删除失败，证明安全边界来自DB代而非清理成功。
  const remove = vi.spyOn(cache.kv, 'compareAndSwap').mockResolvedValueOnce(err(HaiCacheError.OPERATION_FAILED, 'Injected cache failure'))
  expect((await iam.session.deleteByUserId(userId)).success).toBe(false)
  remove.mockRestore()
  expect((await cache.kv.get(`hai:iam:sessions:{${getUserSessionScope(userId)}}`)).success).toBe(true)
  for (const result of [await iam.auth.verifyToken(access), await iam.session.verifyToken(access), await iam.session.refresh(refresh)]) {
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiIamError.SESSION_INVALID.code)
  }
  const next = await iam.auth.login({ identifier: 'generation_user', password: 'TestPass123' })
  expect(next.success).toBe(true)
  if (next.success)
    expect((await iam.auth.verifyToken(next.data.tokens.accessToken)).success).toBe(true)
})

it('旧密码已验证但尚未创建会话时改密，迟到策略不能用当前新代签发', async () => {
  const registered = await iam.user.register({ username: 'paused_login', password: 'TestPass123' })
  if (!registered.success)
    throw new Error(registered.error.message)
  let release!: () => void
  let entered!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const reached = new Promise<void>((resolve) => {
    entered = resolve
  })
  const original = iam.authz.getUserAuthorization.bind(iam.authz)
  vi.spyOn(iam.authz, 'getUserAuthorization').mockImplementationOnce(async (id) => {
    entered()
    await gate
    return original(id)
  })
  const pending = iam.auth.login({ identifier: 'paused_login', password: 'TestPass123' })
  try {
    await reached
    const users = await createDbUserRepository()
    const current = await users.findById(registered.data.user.id)
    if (!current.success || !current.data)
      throw new Error('Missing user')
    const changed = await users.setPassword({ userId: current.data.id, expectedVersion: current.data.credentialVersion ?? '', passwordHash: current.data.passwordHash! })
    expect(changed.success && changed.data).toBe(true)
  }
  finally { release() }
  const result = await pending
  expect(result.success).toBe(false)
  if (!result.success)
    expect(result.error.code).toBe(HaiIamError.SESSION_INVALID.code)
})

it('可信低层创建拒绝缺失/禁用/读取失败与不匹配代，刷新绝不升级旧代', async () => {
  let current: { version: string, enabled: boolean } | null = { version: 'v1', enabled: true }
  const read = vi.fn(async () => ok(current))
  const built = await createSessionOperations({ config: IamConfigSchema.parse({ session: { sliding: false } }), readCredential: read })
  if (!built.success)
    throw new Error(built.error.message)
  const ops = built.data
  expect((await ops.create({ userId: 'u', expectedCredentialVersion: 'old' })).success).toBe(false)
  const session = await ops.create({ userId: 'u', expectedCredentialVersion: 'v1' })
  if (!session.success)
    throw new Error(session.error.message)
  expect(session.data.credentialVersion).toBe('v1')
  current = { version: 'v2', enabled: true }
  expect((await ops.refresh(session.data.data!._tokenPair!.refreshToken)).success).toBe(false)
  expect((await ops.verifyToken(session.data.accessToken)).success).toBe(false)
  current = { version: 'v2', enabled: false }
  expect((await ops.create({ userId: 'u' })).success).toBe(false)
  current = null
  expect((await ops.create({ userId: 'u' })).success).toBe(false)
  read.mockRejectedValueOnce(new Error('Read failed'))
  expect((await ops.create({ userId: 'u' })).success).toBe(false)
})

it('refresh提交窗口发生改密，返回失败且后继仍带旧代而不可认证', async () => {
  let version = 'v1'
  const built = await createSessionOperations({ config: IamConfigSchema.parse({ session: { sliding: false } }), readCredential: async () => ok({ version, enabled: true }) })
  if (!built.success)
    throw new Error(built.error.message)
  const ops = built.data
  const session = await ops.create({ userId: 'race' })
  if (!session.success)
    throw new Error(session.error.message)
  const cas = cache.kv.compareAndSwap.bind(cache.kv)
  vi.spyOn(cache.kv, 'compareAndSwap').mockImplementationOnce(async (...args) => {
    version = 'v2'
    return cas(...args)
  })
  const result = await ops.refresh(session.data.data!._tokenPair!.refreshToken)
  expect(result.success).toBe(false)
  const state = await cache.kv.get<{ sessions: Record<string, { session: { accessToken: string, credentialVersion: string } }> }>(`hai:iam:sessions:{${getUserSessionScope('race')}}`)
  if (!state.success || !state.data)
    throw new Error('Missing state')
  const successor = Object.values(state.data.sessions)[0]!.session
  expect(successor.credentialVersion).toBe('v1')
  expect((await ops.verifyToken(successor.accessToken)).success).toBe(false)
})
