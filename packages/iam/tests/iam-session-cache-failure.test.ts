/** 临时缓存故障不可变成会话不存在或破坏批量撤销范围。 */
import { cache, HaiCacheError } from '@h-ai/cache'
import { err } from '@h-ai/core'
import { afterEach, expect, it, vi } from 'vitest'
import { IamConfigSchema } from '../src/iam-config.js'
import { createSessionOperations } from '../src/session/iam-session-functions.js'
import { acquireRedisContainer } from './helpers/redis-container.js'

async function operations() {
  const result = await createSessionOperations({ config: IamConfigSchema.parse({ session: { sliding: false } }) })
  if (!result.success)
    throw new Error(result.error.message)
  return result.data
}

afterEach(async () => {
  vi.restoreAllMocks()
  await cache.close()
})

it.each(['read', 'commit'] as const)('真实Redis的%s故障保留完整用户分区，恢复后logoutAll撤销全部凭据', async (mode) => {
  const redis = await acquireRedisContainer()
  try {
    expect((await cache.init({ type: 'redis', host: redis.host, port: redis.port })).success).toBe(true)
    const ops = await operations()
    const first = await ops.create({ userId: `fault-${mode}` })
    const second = await ops.create({ userId: `fault-${mode}` })
    if (!first.success || !second.success)
      throw new Error('Cannot issue sessions')
    const keys = await cache.kv.keys('hai:iam:sessions:*')
    if (!keys.success || keys.data.length !== 1)
      throw new Error('Missing partition')
    const key = keys.data[0]!
    const before = await cache.kv.get(key)
    const failure = err(HaiCacheError.OPERATION_FAILED, 'Injected transport outage')
    const spy = mode === 'read'
      ? vi.spyOn(cache.kv, 'get').mockResolvedValueOnce(failure)
      : vi.spyOn(cache.kv, 'compareAndSwap').mockResolvedValueOnce(failure)
    expect((await ops.patchUserSessions(first.data.userId, { roles: ['changed'] })).success).toBe(false)
    spy.mockRestore()
    expect(await cache.kv.get(key)).toEqual(before)
    expect((await ops.verifyToken(first.data.accessToken)).success).toBe(true)
    expect((await ops.verifyToken(second.data.accessToken)).success).toBe(true)
    expect((await ops.patchUserSessions(first.data.userId, { roles: ['recovered'] })).success).toBe(true)
    const recovered = await ops.get(first.data.accessToken)
    expect(recovered.success && recovered.data?.roles).toEqual(['recovered'])
    expect(await ops.deleteByUserId(first.data.userId)).toEqual({ success: true, data: 2 })
    for (const session of [first.data, second.data]) {
      expect((await ops.verifyToken(session.accessToken)).success).toBe(false)
      expect((await ops.refresh(session.data!._tokenPair!.refreshToken)).success).toBe(false)
    }
  }
  finally {
    await cache.close()
    await redis.release()
  }
}, 120000)

it('读取失败不能伪装成不存在；损坏的分区保留并失败关闭，不覆盖未知会话', async () => {
  await cache.init({ type: 'memory' })
  const ops = await operations()
  const issued = await ops.create({ userId: 'corrupted-partition' })
  if (!issued.success)
    throw new Error(issued.error.message)
  const failure = vi.spyOn(cache.kv, 'get').mockResolvedValueOnce(err(HaiCacheError.OPERATION_FAILED, 'Injected read failure'))
  expect((await ops.get(issued.data.accessToken)).success).toBe(false)
  failure.mockRestore()
  const keys = await cache.kv.keys('hai:iam:sessions:*')
  if (!keys.success)
    throw new Error('Missing keys')
  const key = keys.data[0]!
  const broken = { revision: 'malformed', sessions: [] }
  await cache.kv.set(key, broken)
  expect((await ops.patchUserSessions(issued.data.userId, { roles: [] })).success).toBe(false)
  expect((await ops.create({ userId: issued.data.userId })).success).toBe(false)
  expect(await cache.kv.get(key)).toEqual({ success: true, data: broken })
})
