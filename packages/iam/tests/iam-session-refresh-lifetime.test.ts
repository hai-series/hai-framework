/** access 与 refresh 独立到期；保留数据不能延长 access 授权。 */
import { cache } from '@h-ai/cache'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { IamConfigSchema } from '../src/iam-config.js'
import { createSessionOperations } from '../src/session/iam-session-functions.js'
import { acquireRedisContainer } from './helpers/redis-container.js'

async function operations() {
  const result = await createSessionOperations({ readCredential: async () => ({ success: true, data: { version: '', available: true } }), config: IamConfigSchema.parse({ session: { sliding: false, refreshTokenMaxAge: 3600 } }) })
  if (!result.success)
    throw new Error(result.error.message)
  return result.data
}

beforeEach(async () => {
  await cache.init({ type: 'memory' })
})
afterEach(async () => {
  vi.useRealTimers()
  await cache.close()
})

it('access已过期仍可刷新，消费旧refresh及access并沿用会话时长', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  const ops = await operations()
  const issued = await ops.create({ userId: 'expired-access', maxAge: 2 })
  if (!issued.success)
    throw new Error(issued.error.message)
  vi.setSystemTime(Date.now() + 3000)
  expect((await ops.verifyToken(issued.data.accessToken)).success).toBe(false)
  const token = issued.data.data!._tokenPair!.refreshToken
  const rotated = await ops.refresh(token)
  if (!rotated.success)
    throw new Error(rotated.error.message)
  expect(rotated.data.expiresIn).toBe(2)
  expect((await ops.verifyToken(rotated.data.accessToken)).success).toBe(true)
  expect((await ops.verifyToken(issued.data.accessToken)).success).toBe(false)
  expect((await ops.refresh(token)).success).toBe(false)
})

it.each(['refresh', 'access', 'user'] as const)('access到期后%s撤销仍覆盖待刷新记录', async (mode) => {
  vi.useFakeTimers({ toFake: ['Date'] })
  const ops = await operations()
  const issued = await ops.create({ userId: `revoke-${mode}`, maxAge: 2 })
  if (!issued.success)
    throw new Error(issued.error.message)
  vi.setSystemTime(Date.now() + 3000)
  const token = issued.data.data!._tokenPair!.refreshToken
  const revoked = mode === 'refresh' ? await ops.revokeRefresh(token) : mode === 'access' ? await ops.delete(issued.data.accessToken) : await ops.deleteByUserId(issued.data.userId)
  expect(revoked.success).toBe(true)
  expect((await ops.refresh(token)).success).toBe(false)
})

it('refresh独立到期不能轮换，但长寿命access保持其自身有效期', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  const ops = await operations()
  const issued = await ops.create({ userId: 'short-refresh', maxAge: 7200 })
  if (!issued.success)
    throw new Error(issued.error.message)
  vi.setSystemTime(Date.now() + 3600000)
  expect((await ops.refresh(issued.data.data!._tokenPair!.refreshToken)).success).toBe(false)
  expect((await ops.verifyToken(issued.data.accessToken)).success).toBe(true)
})

it('真实Redis保留短access的refresh，重建操作对象后可轮换，撤销不复活', async () => {
  const redis = await acquireRedisContainer()
  const config = { type: 'redis' as const, host: redis.host, port: redis.port }
  try {
    expect((await cache.init(config)).success).toBe(true)
    const ops = await operations()
    const issued = await ops.create({ userId: 'redis-independent-refresh', maxAge: 1 })
    if (!issued.success)
      throw new Error(issued.error.message)
    await new Promise(resolve => setTimeout(resolve, 1100))
    expect((await ops.verifyToken(issued.data.accessToken)).success).toBe(false)
    await cache.close()
    expect((await cache.init(config)).success).toBe(true)
    const restarted = await operations()
    const results = await Promise.all([
      restarted.refresh(issued.data.data!._tokenPair!.refreshToken),
      restarted.refresh(issued.data.data!._tokenPair!.refreshToken),
    ])
    expect(results.filter(result => result.success)).toHaveLength(1)
    expect((await restarted.deleteByUserId(issued.data.userId)).success).toBe(true)
    const winner = results.find(result => result.success)
    if (!winner?.success)
      throw new Error('Missing rotation winner')
    expect((await restarted.verifyToken(winner.data.accessToken)).success).toBe(false)
    expect((await restarted.refresh(winner.data.refreshToken)).success).toBe(false)
  }
  finally {
    await cache.close()
    await redis.release()
  }
}, 120000)
