import { afterEach, expect, it, vi } from 'vitest'
import { cache, HaiCacheError } from '../src/index.js'
import { defineCacheSuite, memoryEnv } from './helpers/cache-test-suite.js'

defineCacheSuite('memory provider boundaries', memoryEnv, () => {
  afterEach(() => vi.restoreAllMocks())

  it('同一轮移除最后一个元素再创建列表，旧的过期时间会清除', async () => {
    await cache.list.rpush('queue', 'old')
    await cache.kv.expire('queue', 60)
    const [popped, pushed] = await Promise.all([
      cache.list.lpop('queue'),
      cache.list.rpush('queue', 'new'),
    ])
    expect(popped).toEqual({ success: true, data: 'old' })
    expect(pushed).toEqual({ success: true, data: 1 })
    expect(await cache.kv.ttl('queue')).toEqual({ success: true, data: -1 })
  })

  it.each(['blpop', 'brpop'] as const)('%s 按键顺序取值，只检查遇到的键', async (method) => {
    await cache.list.rpush('queue', 'ready')
    await cache.kv.set('string', 'other')
    expect(await cache.list[method](1, 'missing', 'string', 'queue')).toMatchObject({
      success: false,
      error: { code: HaiCacheError.OPERATION_FAILED.code },
    })
    expect(await cache.list[method](1, 'missing', 'queue', 'string')).toEqual({
      success: true,
      data: ['queue', 'ready'],
    })
  })

  it('序列化失败返回结构化错误，批量结构操作不部分写入', async () => {
    const cyclic: { self?: object } = {}
    cyclic.self = cyclic
    await cache.hash.hset('hash', 'existing', true)
    await cache.list.rpush('list', 'existing')
    await cache.set_.sadd('set', 'existing')
    const outcomes = await Promise.allSettled([
      cache.hash.hset('hash', { added: true, invalid: cyclic }),
      cache.list.lpush('list', 'added', cyclic),
      cache.set_.sadd('set', 'added', cyclic),
      cache.set_.srem('set', 'existing', cyclic),
    ])
    for (const outcome of outcomes) {
      expect(outcome).toMatchObject({
        status: 'fulfilled',
        value: {
          success: false,
          error: { code: HaiCacheError.SERIALIZATION_FAILED.code },
        },
      })
    }
    expect(await cache.hash.hgetall('hash')).toEqual({
      success: true,
      data: { existing: true },
    })
    expect(await cache.list.lrange('list', 0, -1)).toEqual({
      success: true,
      data: ['existing'],
    })
    expect(await cache.set_.smembers('set')).toEqual({
      success: true,
      data: ['existing'],
    })
  })

  it('先生成 JSON 快照，序列化重入时 NX 和 CAS 各只有一次提交', async () => {
    let nestedSet: ReturnType<typeof cache.kv.set> | undefined
    const written = await cache.kv.set('nx', {
      toJSON() {
        nestedSet = cache.kv.set('nx', 'inner', { nx: true })
        return 'outer'
      },
    }, { nx: true })
    expect(await nestedSet).toEqual({ success: true, data: true })
    expect(written).toEqual({ success: true, data: false })
    expect(await cache.kv.get('nx')).toEqual({ success: true, data: 'inner' })

    await cache.kv.set('cas', 'previous')
    let nestedCas: ReturnType<typeof cache.kv.compareAndSwap> | undefined
    const swapped = await cache.kv.compareAndSwap('cas', 'previous', {
      toJSON() {
        nestedCas = cache.kv.compareAndSwap('cas', 'previous', 'inner')
        return 'outer'
      },
    })
    expect(await nestedCas).toEqual({ success: true, data: true })
    expect(swapped).toEqual({ success: true, data: false })
    expect(await cache.kv.get('cas')).toEqual({ success: true, data: 'inner' })
  })

  it('hash 计数拒绝非数值、非整数和溢出，保留原字段和期限', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000)
    const original = { text: '42', empty: null, maximum: Number.MAX_SAFE_INTEGER }
    await cache.hash.hset('counts', original)
    await cache.kv.expire('counts', 60)
    for (const field of Object.keys(original)) {
      expect(await cache.hash.hincrBy('counts', field, 1)).toMatchObject({
        success: false,
        error: { code: HaiCacheError.OPERATION_FAILED.code },
      })
    }
    expect(await cache.hash.hincrBy('counts', 'new', 0.5)).toMatchObject({
      success: false,
      error: { code: HaiCacheError.OPERATION_FAILED.code },
    })
    expect(await cache.hash.hgetall('counts')).toEqual({ success: true, data: original })
    expect(await cache.kv.ttl('counts')).toEqual({ success: true, data: 60 })
  })

  it('无效过期时间保留 TTL，PERSIST 只在移除期限时返回 true', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000)
    await cache.kv.set('held', 'value', { ex: 60 })
    for (const result of [
      await cache.kv.expire('held', Number.NaN),
      await cache.kv.expireAt('held', 2.5),
    ]) {
      expect(result).toMatchObject({
        success: false,
        error: { code: HaiCacheError.OPERATION_FAILED.code },
      })
    }
    expect(await cache.kv.ttl('held')).toEqual({ success: true, data: 60 })
    expect(await cache.kv.persist('held')).toEqual({ success: true, data: true })
    expect(await cache.kv.persist('held')).toEqual({ success: true, data: false })
    expect(await cache.kv.expire('held', 0)).toEqual({ success: true, data: true })
    expect(await cache.kv.get('held')).toEqual({ success: true, data: null })
  })

  it('无效租期不会发放锁凭据或延长现有锁', async () => {
    expect(await cache.lock.acquire('job', { ttl: 0 })).toMatchObject({
      success: false,
      error: { code: HaiCacheError.OPERATION_FAILED.code },
    })
    expect(await cache.lock.acquire('job', { ttl: null as never })).toMatchObject({
      success: false,
      error: { code: HaiCacheError.OPERATION_FAILED.code },
    })
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000)
    const owner = await cache.lock.acquire('job', { ttl: 1 })
    expect(owner.success && owner.data).toBeTruthy()
    if (!owner.success || !owner.data)
      throw new Error('Expected lock acquisition')
    expect(await cache.lock.extend('job', Number.NaN, owner.data)).toMatchObject({
      success: false,
      error: { code: HaiCacheError.OPERATION_FAILED.code },
    })
    now.mockReturnValue(2000)
    expect(await cache.lock.isLocked('job')).toEqual({ success: true, data: false })
  })

  it('按 count 随机弹出完整数量，随机抽样区分是否放回', async () => {
    await cache.set_.sadd('set', 'a', 'b', 'c', 'd')
    expect(await cache.set_.srandmember<string>('set', 4)).toEqual({
      success: true,
      data: expect.arrayContaining(['a', 'b', 'c', 'd']),
    })
    expect(await cache.set_.spop<string>('set', 4)).toEqual({
      success: true,
      data: expect.arrayContaining(['a', 'b', 'c', 'd']),
    })
    expect(await cache.set_.spop('set', 1)).toEqual({ success: true, data: [] })
    expect(await cache.set_.srandmember('set', 1)).toEqual({ success: true, data: [] })
    await cache.set_.sadd('set', 'one')
    expect(await cache.set_.srandmember('set', -3)).toEqual({
      success: true,
      data: ['one', 'one', 'one'],
    })
    expect(await cache.set_.srandmember('set', -0x1_0000_0000)).toMatchObject({
      success: false,
      error: { code: HaiCacheError.OPERATION_FAILED.code },
    })
  })

  it('区间终点早于第一个元素时是空区间', async () => {
    await cache.list.rpush('list', 'a', 'b', 'c')
    expect(await cache.list.lrange('list', 0, -5)).toEqual({ success: true, data: [] })
    expect(await cache.list.ltrim('list', 0, -5)).toEqual({ success: true, data: undefined })
    expect(await cache.kv.exists('list')).toEqual({ success: true, data: 0 })
    await cache.zset.zadd('zset', { member: 'a', score: 1 }, { member: 'b', score: 2 }, { member: 'c', score: 3 })
    expect(await cache.zset.zrange('zset', 0, -5)).toEqual({ success: true, data: [] })
    expect(await cache.zset.zrevrange('zset', 0, -5)).toEqual({ success: true, data: [] })
    expect(await cache.zset.zremRangeByRank('zset', 0, -5)).toEqual({ success: true, data: 0 })
  })

  it('有序集合统一同分顺序、排他边界与独立分页参数', async () => {
    await cache.zset.zadd('zset', { member: 'z', score: 2 }, { member: 'a', score: 2 }, { member: 'low', score: 1 })
    expect(await cache.zset.zrange('zset', 0, -1)).toEqual({
      success: true,
      data: ['low', 'a', 'z'],
    })
    expect(await cache.zset.zrevrank('zset', 'z')).toEqual({ success: true, data: 0 })
    expect(await cache.zset.zrangeByScore('zset', '(1', '+inf', { count: 1 })).toEqual({
      success: true,
      data: ['a'],
    })
    expect(await cache.zset.zrangeByScore('zset', '-inf', '+inf', { offset: 1 })).toEqual({
      success: true,
      data: ['a', 'z'],
    })
    expect(await cache.zset.zcount('zset', '(1', 2)).toEqual({ success: true, data: 2 })
    expect(await cache.zset.zremRangeByScore('zset', '-inf', '(2')).toEqual({ success: true, data: 1 })
  })

  it('拒绝无效有序集合分数并保留原成员', async () => {
    await cache.zset.zadd('zset', { member: 'existing', score: 1 })
    expect(await cache.zset.zadd('zset', { member: 'existing', score: 2 }, { member: 'bad', score: Number.NaN }))
      .toMatchObject({
        success: false,
        error: { code: HaiCacheError.OPERATION_FAILED.code },
      })
    expect(await cache.zset.zscore('zset', 'existing')).toEqual({ success: true, data: 1 })
    expect(await cache.zset.zscore('zset', 'bad')).toEqual({ success: true, data: null })
    expect(await cache.zset.zadd('zset', { member: 'infinite', score: Number.POSITIVE_INFINITY }))
      .toEqual({ success: true, data: 1 })
    expect(await cache.zset.zcount('zset', '(-inf', '+inf')).toEqual({ success: true, data: 2 })
    expect(await cache.zset.zscore('zset', 'infinite')).toEqual({ success: true, data: Number.POSITIVE_INFINITY })
  })
})
