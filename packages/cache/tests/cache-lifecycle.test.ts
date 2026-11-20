/** 缓存生命周期故障回归：候选连接不可发布，释放失败必须保留并阻止替换。 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cache, HaiCacheError } from '../src/index.js'

const faults = vi.hoisted(() => ({
  connect: 0,
  close: 0,
  allocated: 0,
  closed: 0,
  healthStarted: false,
  wait: null as Promise<void> | null,
}))

vi.mock('../src/providers/cache-provider-memory.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/providers/cache-provider-memory.js')>()
  return {
    createMemoryProvider() {
      faults.allocated++
      const provider = original.createMemoryProvider()
      const connect = provider.connect.bind(provider)
      const close = provider.close.bind(provider)
      provider.connect = async (config) => {
        const result = await connect(config)
        faults.healthStarted = true
        if (faults.wait)
          await faults.wait
        if (faults.connect-- > 0)
          throw new Error('injected health failure after allocation')
        return result
      }
      provider.close = async () => {
        if (faults.close-- > 0)
          throw new Error('injected cleanup failure')
        await close()
        faults.closed++
      }
      return provider
    },
  }
})

afterEach(async () => {
  faults.close = 0
  await cache.close()
  Object.assign(faults, {
    connect: 0,
    close: 0,
    allocated: 0,
    closed: 0,
    healthStarted: false,
    wait: null,
  })
})

describe('cache lifecycle ownership', { concurrent: false }, () => {
  it('failed health closes the candidate and allows a clean retry', async () => {
    faults.connect = 1
    expect((await cache.init({ type: 'memory' })).success).toBe(false)
    expect(cache.isInitialized).toBe(false)
    expect(cache.config).toBeNull()
    expect(faults.closed).toBe(1)
    expect((await cache.init({ type: 'memory' })).success).toBe(true)
  })

  it('failed close retains the resource, rejects replacement, and can be retried', async () => {
    expect((await cache.init({ type: 'memory' })).success).toBe(true)
    const { kv } = cache
    faults.close = 2
    const result = await cache.close()
    expect(result?.success).toBe(false)
    expect(cache.isInitialized).toBe(false)
    expect((await cache.kv.get('closed')).success).toBe(false)
    expect(await kv.set('closed', true)).toMatchObject({
      success: false,
      error: { code: HaiCacheError.NOT_INITIALIZED.code },
    })
    expect((await cache.init({ type: 'memory' })).success).toBe(false)
    expect(faults.allocated).toBe(1)
    expect((await cache.close())?.success).toBe(true)
    expect((await cache.init({ type: 'memory' })).success).toBe(true)
  })

  it('reinitialization invalidates all old operation groups and extracted methods', async () => {
    expect((await cache.init({ type: 'memory' })).success).toBe(true)
    const { kv, hash, list, set_, zset, lock } = cache
    const { set } = kv
    expect(await set('old', 'value')).toEqual({ success: true, data: true })

    expect((await cache.init({ type: 'memory' })).success).toBe(true)
    const rejected = {
      success: false,
      error: { code: HaiCacheError.NOT_INITIALIZED.code },
    }
    expect(await kv.get('old')).toMatchObject(rejected)
    expect(await set('new', 'stale')).toMatchObject(rejected)
    expect(await hash.hset('hash', 'field', 'stale')).toMatchObject(rejected)
    expect(await list.rpush('list', 'stale')).toMatchObject(rejected)
    expect(await set_.sadd('set', 'stale')).toMatchObject(rejected)
    expect(await zset.zadd('zset', { member: 'stale', score: 1 })).toMatchObject(rejected)
    expect(await lock.acquire('lock')).toMatchObject(rejected)
    expect(await cache.kv.get('new')).toEqual({ success: true, data: null })
    expect(await cache.kv.set('new', 'fresh')).toEqual({ success: true, data: true })

    const current = cache.kv
    expect((await cache.close()).success).toBe(true)
    expect(await current.get('new')).toMatchObject(rejected)
  })

  it('concurrent close calls release one resource once', async () => {
    expect((await cache.init({ type: 'memory' })).success).toBe(true)
    const results = await Promise.all([
      cache.close(),
      cache.close(),
      cache.close(),
    ])
    expect(results.every(result => result?.success)).toBe(true)
    expect(faults.closed).toBe(1)
    expect((await cache.close())?.success).toBe(true)
  })

  it('close waits for an initializing candidate and prevents a second init', async () => {
    let release!: () => void
    faults.wait = new Promise<void>((resolve) => {
      release = resolve
    })
    try {
      const initializing = cache.init({ type: 'memory' })
      await vi.waitFor(() => expect(faults.healthStarted).toBe(true))
      const closing = cache.close()
      expect((await cache.init({ type: 'memory' })).success).toBe(false)
      release()
      expect((await initializing).success).toBe(true)
      expect((await closing).success).toBe(true)
      expect(cache.isInitialized).toBe(false)
      expect(faults.closed).toBe(1)
    }
    finally { release() }
  })
})
