/** 自定义时长、返回值、滑动时间和实际 Redis TTL 保持一致。 */
import type { IamConfigInput } from '../src/iam-types.js'
import type { SessionOperationsDeps } from '../src/session/iam-session-functions.js'
import { cache } from '@h-ai/cache'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { IamConfigSchema } from '../src/iam-config.js'
import { HaiIamError } from '../src/iam-types.js'
import { createSessionOperations } from '../src/session/iam-session-functions.js'
import { acquireRedisContainer } from './helpers/redis-container.js'

async function operations(
  sliding = true,
  session: IamConfigInput['session'] = {},
  readCredential: SessionOperationsDeps['readCredential'] = async () => ({
    success: true,
    data: { version: '', available: true },
  }),
) {
  const result = await createSessionOperations({
    readCredential,
    config: IamConfigSchema.parse({
      session: { sliding, maxAge: 60, ...session },
    }),
  })
  if (!result.success)
    throw new Error(result.error.message)
  return result.data
}

function useClock() {
  vi.useFakeTimers({
    toFake: ['Date'],
  })
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

it('默认五秒内复用共享提交时间，到达窗口后只写一次', async () => {
  const clock = useClock()
  const ops = await operations()
  const peer = await operations()
  const created = await ops.create({ userId: 'coalesced-touch' })
  if (!created.success)
    throw new Error(created.error.message)
  const token = created.data.accessToken
  const write = vi.spyOn(cache.kv, 'compareAndSwap')
  clock(4.999)
  expect(await peer.get(token)).toMatchObject({
    success: true,
    data: { lastActiveAt: created.data.lastActiveAt, expiresAt: created.data.expiresAt },
  })
  expect(write).not.toHaveBeenCalled()
  clock(5)
  const extended = await ops.get(token)
  if (!extended.success || !extended.data)
    throw new Error('Expected extended access')
  expect(extended.data.lastActiveAt.toISOString()).toBe('2026-01-01T00:00:05.000Z')
  expect(extended.data.expiresAt.toISOString()).toBe('2026-01-01T00:01:05.000Z')
  clock(9)
  expect(await peer.get(token)).toEqual(extended)
  expect(write).toHaveBeenCalledTimes(1)
})

it('短会话按固有时长的十分之一续期，临近到期可立即滑动', async () => {
  const clock = useClock()
  const ops = await operations()
  const issued = await ops.create({ userId: 'bounded-touch', maxAge: 10 })
  if (!issued.success)
    throw new Error(issued.error.message)
  const { accessToken, version } = issued.data
  const write = vi.spyOn(cache.kv, 'compareAndSwap')
  clock(0.999)
  expect((await ops.get(accessToken)).success).toBe(true)
  expect(write).not.toHaveBeenCalled()
  clock(1)
  expect((await ops.get(accessToken)).success).toBe(true)
  expect(write).toHaveBeenCalledOnce()

  const patched = await ops.update(accessToken, {
    expiresAt: new Date('2026-01-01T00:00:02Z'),
  }, version)
  expect(patched.success).toBe(true)
  write.mockClear()
  clock(1.5)
  const renewed = await ops.get(accessToken)
  expect(renewed.success && renewed.data?.expiresAt.toISOString()).toBe('2026-01-01T00:00:11.500Z')
  expect(write).toHaveBeenCalledOnce()
})

it.each([
  { touchMinInterval: 0 },
  { idleTimeout: 2 },
])('停用合并的策略 %j 仍精确记录活动，同一时刻无需重复提交', async (session) => {
  const clock = useClock()
  const ops = await operations(true, session)
  const issued = await ops.create({ userId: 'exact-touch' })
  if (!issued.success)
    throw new Error(issued.error.message)
  const token = issued.data.accessToken
  const write = vi.spyOn(cache.kv, 'compareAndSwap')
  clock(0.1)
  const extended = await ops.get(token)
  expect(extended.success && extended.data?.lastActiveAt.toISOString()).toBe('2026-01-01T00:00:00.100Z')
  expect(extended.success && extended.data?.expiresAt.toISOString()).toBe('2026-01-01T00:01:00.100Z')
  expect(await ops.get(token)).toEqual(extended)
  expect(write).toHaveBeenCalledOnce()
  if (session.idleTimeout) {
    clock(2.1)
    expect(await ops.get(token)).toEqual({ success: true, data: null })
  }
})

it('资料更新推进活动时间后仍提交显著增加的 access 期限', async () => {
  const clock = useClock()
  const ops = await operations()
  const created = await ops.create({ userId: 'touch-after-profile-update' })
  if (!created.success)
    throw new Error(created.error.message)
  const { accessToken, version } = created.data

  clock(10)
  expect((await ops.update(accessToken, { displayName: 'Updated name' }, version)).success).toBe(true)
  const write = vi.spyOn(cache.kv, 'compareAndSwap')
  clock(11)
  const renewed = await ops.get(accessToken)
  expect(renewed.success && renewed.data?.expiresAt.toISOString()).toBe('2026-01-01T00:01:11.000Z')
  expect(write).toHaveBeenCalledOnce()
})

it('绝对期限仍阻止跳写路径中的访问和刷新', async () => {
  const clock = useClock()
  const ops = await operations(true, { absoluteTimeout: 3 })
  const issued = await ops.create({ userId: 'absolute-while-skipping' })
  if (!issued.success)
    throw new Error(issued.error.message)
  const { accessToken } = issued.data
  const write = vi.spyOn(cache.kv, 'compareAndSwap')
  clock(2.999)
  expect((await ops.verifyToken(accessToken)).success).toBe(true)
  expect(write).not.toHaveBeenCalled()
  clock(3)
  expect(await ops.get(accessToken)).toEqual({ success: true, data: null })
  expect((await ops.refresh(issued.data.data!._tokenPair!.refreshToken)).success).toBe(false)
  expect(write).not.toHaveBeenCalled()
})

it.each(['logout', 'update'] as const)('写入间隔内仍检查共享状态的 %s 变更', async (action) => {
  const clock = useClock()
  const ops = await operations()
  const created = await ops.create({ userId: 'recheck-shared-state' })
  if (!created.success)
    throw new Error(created.error.message)
  const { accessToken, version } = created.data
  const checked = Promise.withResolvers<void>()
  const resume = Promise.withResolvers<void>()
  const peer = await operations(true, {}, async () => {
    checked.resolve()
    await resume.promise
    return {
      success: true,
      data: { version: '', available: true },
    }
  })

  clock(1)
  const pending = peer.get(accessToken)
  try {
    await Promise.race([
      checked.promise,
      pending.then(() => { throw new Error('Expected the credential check to be pending') }),
    ])
    const change = action === 'logout'
      ? await ops.delete(accessToken)
      : await ops.update(accessToken, {
          data: { theme: 'dark' },
        }, version)
    expect(change.success).toBe(true)
    resume.resolve()
    expect(await pending).toMatchObject({
      success: false,
      error: {
        code: action === 'logout'
          ? HaiIamError.SESSION_NOT_FOUND.code
          : HaiIamError.CONFLICT.code,
      },
    })
  }
  finally {
    resume.resolve()
    await pending
  }
})

it('仓库读取后已到期的 access 不会删除仍有效的 refresh', async () => {
  const clock = useClock()
  const ops = await operations(false)
  const issued = await ops.create({ userId: 'expired-after-access-read', maxAge: 2 })
  if (!issued.success)
    throw new Error(issued.error.message)
  const { accessToken, expiresAt } = issued.data
  clock(2.001)
  // 仓库读到截止时间前的快照，服务层复查时已经超过截止时间。
  const priorSample = vi.spyOn(Date, 'now').mockReturnValue(expiresAt.getTime() - 1)
  const write = vi.spyOn(cache.kv, 'compareAndSwap')
  expect(await ops.get(accessToken)).toEqual({ success: true, data: null })
  expect(write).not.toHaveBeenCalled()
  priorSample.mockRestore()
  expect((await ops.refresh(issued.data.data!._tokenPair!.refreshToken)).success).toBe(true)
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
  expect((await ops.update(created.data.accessToken, {
    expiresAt: new Date(Number.NaN),
  }, latest.data.version)).success).toBe(false)
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

it.each([
  0,
  -1,
  1.5,
  Number.POSITIVE_INFINITY,
  Number.MAX_SAFE_INTEGER,
])('非法maxAge %s 返回业务失败且不写会话', async (maxAge) => {
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

it('真实Redis在五秒内保留原分区，窗口到期只提交一次续期', async () => {
  const redis = await acquireRedisContainer()
  try {
    expect((await cache.init({ type: 'redis', host: redis.host, port: redis.port })).success).toBe(true)
    const clock = useClock()
    const issuer = await operations()
    const peer = await operations()
    const issued = await issuer.create({ userId: 'redis-coalesced-touch' })
    if (!issued.success)
      throw new Error(issued.error.message)
    const keys = await cache.kv.keys('hai:iam:sessions:*')
    if (!keys.success || keys.data.length !== 1)
      throw new Error('Missing session partition')
    const key = keys.data[0]!
    const initial = await cache.kv.get(key)
    expect(initial).toMatchObject({
      success: true,
      data: {
        revision: expect.any(String),
      },
    })
    const write = vi.spyOn(cache.kv, 'compareAndSwap')
    clock(1)
    expect(await issuer.get(issued.data.accessToken)).toMatchObject({
      success: true,
      data: { expiresAt: issued.data.expiresAt },
    })
    clock(4.999)
    expect(await peer.get(issued.data.accessToken)).toMatchObject({
      success: true,
      data: { lastActiveAt: issued.data.lastActiveAt },
    })
    expect(await cache.kv.get(key)).toEqual(initial)
    expect(write).not.toHaveBeenCalled()

    clock(5)
    const renewed = await peer.get(issued.data.accessToken)
    expect(renewed).toMatchObject({
      success: true,
      data: {
        lastActiveAt: new Date('2026-01-01T00:00:05Z'),
        expiresAt: new Date('2026-01-01T00:01:05Z'),
      },
    })
    const committed = await cache.kv.get(key)
    expect(committed).not.toEqual(initial)
    clock(6)
    expect(await issuer.get(issued.data.accessToken)).toEqual(renewed)
    expect(await cache.kv.get(key)).toEqual(committed)
    expect(write).toHaveBeenCalledOnce()
  }
  finally {
    vi.useRealTimers()
    await cache.close()
    await redis.release()
  }
}, 120000)
