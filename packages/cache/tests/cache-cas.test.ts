/** CAS 的未命中、并发、TTL 和空值契约在 Memory/Redis 一致。 */
import { expect, it } from 'vitest'
import { cache } from '../src/index.js'
import { defineCacheSuite, memoryEnv, redisEnv } from './helpers/cache-test-suite.js'

function tests() {
  it('输入或读取快照的对象修改不能绕过CAS更新存储', async () => {
    const value = { revision: 1 }
    await cache.kv.compareAndSwap('cas:snapshot', undefined, value)
    value.revision = 2
    const snapshot = await cache.kv.get<{ revision: number }>('cas:snapshot')
    expect(snapshot).toEqual({ success: true, data: { revision: 1 } })
    if (snapshot.success && snapshot.data)
      snapshot.data.revision = 3
    expect(await cache.kv.get('cas:snapshot')).toEqual({ success: true, data: { revision: 1 } })
  })
  it('区分不存在与JSON null，条件失败不改变值', async () => {
    expect(await cache.kv.compareAndSwap('cas:null', undefined, null)).toEqual({ success: true, data: true })
    expect(await cache.kv.compareAndSwap('cas:null', undefined, 'wrong')).toEqual({ success: true, data: false })
    expect(await cache.kv.compareAndSwap('cas:null', null, { version: 1 }, { px: 60000 })).toEqual({ success: true, data: true })
    expect(await cache.kv.compareAndSwap('cas:null', null, undefined)).toEqual({ success: true, data: false })
    expect(await cache.kv.compareAndSwap('cas:null', { version: 1 }, undefined)).toEqual({ success: true, data: true })
  })

  it('同一快照的多个候选只能提交一个，旧候选不能覆盖后继', async () => {
    const results = await Promise.all(Array.from({ length: 16 }, (_, candidate) => cache.kv.compareAndSwap('cas:race', undefined, { candidate })))
    expect(results.filter(result => result.success && result.data)).toHaveLength(1)
    const latest = await cache.kv.get('cas:race')
    expect(latest.success && latest.data).toMatchObject({ candidate: expect.any(Number) })
    expect(await cache.kv.compareAndSwap('cas:race', { candidate: -1 }, 'stale')).toEqual({ success: true, data: false })
  })

  it('写入TTL、保留TTL与非法TTL不会静默变成永久值', async () => {
    await cache.kv.compareAndSwap('cas:ttl', undefined, 'first', { px: 60000 })
    expect(await cache.kv.compareAndSwap('cas:ttl', 'first', 'second', { keepTtl: true })).toEqual({ success: true, data: true })
    const ttl = await cache.kv.ttl('cas:ttl')
    expect(ttl.success && ttl.data).toBeGreaterThanOrEqual(58)
    for (const options of [{ px: 0 }, { px: -1 }, { px: 1.5 }, { px: 1, keepTtl: true }]) {
      expect((await cache.kv.compareAndSwap('cas:ttl', 'second', 'invalid', options)).success).toBe(false)
      expect(await cache.kv.get('cas:ttl')).toEqual({ success: true, data: 'second' })
    }
  })
}

defineCacheSuite('CAS memory', memoryEnv, tests)
defineCacheSuite('CAS redis', redisEnv, tests)
