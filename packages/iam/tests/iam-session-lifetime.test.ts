/** 自定义时长、返回值、滑动时间和实际 Redis TTL 保持一致。 */
import { cache } from '@h-ai/cache'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { IamConfigSchema } from '../src/iam-config.js'
import { createSessionOperations } from '../src/session/iam-session-functions.js'
import { acquireRedisContainer } from './helpers/redis-container.js'

async function operations(sliding = true) {
  const result = await createSessionOperations({ readCredential: async () => ({ success: true, data: { version: '', enabled: true } }), config: IamConfigSchema.parse({ session: { sliding, maxAge: 60 } }) })
  if (!result.success)
    throw new Error(result.error.message)
  return result.data
}

function useClock() {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  return (seconds: number) => vi.setSystemTime(new Date(Date.UTC(2026, 0, 1) + seconds * 1000))
}

beforeEach(async () => {
  await cache.init({ type: 'memory' })
})
afterEach(async () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  await cache.close()
})

it('自定义时长进入token与会话，滑动后返回已提交时间，跨越新边界时失效', async () => {
  const clock = useClock()
  const ops = await operations()
  const created = await ops.create({ userId: 'custom-lifetime', maxAge: 7 })
  if (!created.success)
    throw new Error(created.error.message)
  expect(created.data.maxAge).toBe(7)
  expect(created.data.data?._tokenPair?.expiresIn).toBe(7)
  expect(created.data.expiresAt.getTime() - created.data.createdAt.getTime()).toBe(7000)
  clock(5)
  const first = await ops.get(created.data.accessToken)
  expect(first.success && first.data?.expiresAt.toISOString()).toBe('2026-01-01T00:00:12.000Z')
  expect(first.success && first.data?.lastActiveAt.toISOString()).toBe('2026-01-01T00:00:05.000Z')
  clock(8)
  const second = await ops.get(created.data.accessToken)
  expect(second.success && second.data?.expiresAt.toISOString()).toBe('2026-01-01T00:00:15.000Z')
  clock(15)
  expect(await ops.get(created.data.accessToken)).toEqual({ success: true, data: null })
})

it('refresh 沿用该会话自定义时长，不恢复成配置默认60秒', async () => {
  const clock = useClock()
  const ops = await operations(false)
  const created = await ops.create({ userId: 'custom-refresh', maxAge: 7 })
  if (!created.success)
    throw new Error(created.error.message)
  clock(3)
  const refreshed = await ops.refresh(created.data.data!._tokenPair!.refreshToken)
  if (!refreshed.success)
    throw new Error(refreshed.error.message)
  expect(refreshed.data.expiresIn).toBe(7)
  const latest = await ops.get(refreshed.data.accessToken)
  expect(latest.success && latest.data?.expiresAt.toISOString()).toBe('2026-01-01T00:00:10.000Z')
})

it('显式lastActiveAt/expiresAt补丁被完整应用，非法时间不落盘', async () => {
  useClock()
  const ops = await operations(false)
  const created = await ops.create({ userId: 'timestamp-patch', maxAge: 7 })
  if (!created.success)
    throw new Error(created.error.message)
  const updated = await ops.update(created.data.accessToken, {
    lastActiveAt: new Date('2026-01-01T00:00:02Z'),
    expiresAt: new Date('2026-01-01T00:00:04Z'),
  }, created.data.version)
  expect(updated.success).toBe(true)
  const latest = await ops.get(created.data.accessToken)
  if (!latest.success || !latest.data)
    throw new Error('No updated session')
  expect(latest.data.lastActiveAt.toISOString()).toBe('2026-01-01T00:00:02.000Z')
  expect(latest.data.expiresAt.toISOString()).toBe('2026-01-01T00:00:04.000Z')
  expect((await ops.update(created.data.accessToken, { expiresAt: new Date(Number.NaN) }, latest.data.version)).success).toBe(false)
  expect((await ops.get(created.data.accessToken)).success).toBe(true)
})

it('旧滑动请求迟到重试不会缩短新请求提交的时间', async () => {
  const clock = useClock()
  const ops = await operations()
  const created = await ops.create({ userId: 'late-touch', maxAge: 7 })
  if (!created.success)
    throw new Error(created.error.message)
  const captured = Promise.withResolvers<void>()
  const resume = Promise.withResolvers<void>()
  const write = cache.kv.compareAndSwap.bind(cache.kv)
  let first = true
  vi.spyOn(cache.kv, 'compareAndSwap').mockImplementation(async (...args) => {
    if (first) {
      first = false
      captured.resolve()
      await resume.promise
    }
    return write(...args)
  })
  clock(2)
  const delayed = ops.get(created.data.accessToken)
  await captured.promise
  clock(6)
  const newer = await ops.get(created.data.accessToken)
  expect(newer.success && newer.data?.expiresAt.toISOString()).toBe('2026-01-01T00:00:13.000Z')
  resume.resolve()
  const old = await delayed
  expect(old.success && old.data?.expiresAt.toISOString()).toBe('2026-01-01T00:00:13.000Z')
  expect(old.success && old.data?.lastActiveAt.toISOString()).toBe('2026-01-01T00:00:06.000Z')
})

it.each([0, -1, 1.5, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER])('非法maxAge %s 返回业务失败且不写会话', async (maxAge) => {
  const ops = await operations()
  expect((await ops.create({ userId: 'invalid-age', maxAge })).success).toBe(false)
  expect(await cache.kv.keys('hai:iam:sessions:*')).toEqual({ success: true, data: [] })
})

it('真实Redis中自定义access到期拒绝认证，分区保留到refresh期限', async () => {
  const redis = await acquireRedisContainer()
  try {
    expect((await cache.init({ type: 'redis', host: redis.host, port: redis.port })).success).toBe(true)
    const ops = await operations(false)
    const created = await ops.create({ userId: 'redis-custom-age', maxAge: 2 })
    if (!created.success)
      throw new Error(created.error.message)
    expect(created.data.data?._tokenPair?.expiresIn).toBe(2)
    const keys = await cache.kv.keys('hai:iam:sessions:*')
    if (!keys.success || keys.data.length !== 1)
      throw new Error('Missing session partition')
    const ttl = await cache.kv.ttl(keys.data[0]!)
    expect(ttl.success && ttl.data).toBeGreaterThanOrEqual(604799)
    expect(ttl.success && ttl.data).toBeLessThanOrEqual(604800)
    await new Promise(resolve => setTimeout(resolve, 2100))
    expect(await ops.get(created.data.accessToken)).toEqual({ success: true, data: null })
  }
  finally {
    await cache.close()
    await redis.release()
  }
}, 120000)
