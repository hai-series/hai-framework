/** 默认 Store 的真实原子版本条件与存储端期限；Memory 为显式测试例外。 */
import type { AIRelStore, AIStoreProvider } from '../src/store/ai-store-types.js'
import { reldb } from '@h-ai/reldb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDbStoreProviderFromModules } from '../src/store/providers/ai-store-provider-db.js'
import { createMemoryStoreProvider } from '../src/store/providers/ai-store-provider-memory.js'

interface State { messages: string[] }

let sequence = 0
describe.each(['memory', 'sqlite'] as const)('store CAS %s', (backend) => {
  let provider: AIStoreProvider
  let a: AIRelStore<State>
  let b: AIRelStore<State>
  beforeEach(async () => {
    provider = backend === 'memory' ? createMemoryStoreProvider() : createDbStoreProviderFromModules()
    const table = `hai_ai_cas_${sequence++}`
    a = provider.createRelStore<State>(table, { hasObjectId: true })
    b = provider.createRelStore<State>(table, { hasObjectId: true })
    await provider.initialize()
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    await provider.close?.()
  })

  it('缺失只能创建一次，旧版本不能覆盖较新写入', async () => {
    const initial = await a.compareAndSwap('one', { expectedVersion: undefined, data: { messages: [] }, scope: { objectId: 'owner' } })
    expect(initial).toEqual(expect.any(String))
    expect(await b.compareAndSwap('one', { expectedVersion: undefined, data: { messages: ['late-create'] } })).toBeUndefined()
    const read = await b.readVersioned('one')
    expect(read?.version).toBe(initial)
    const next = await b.compareAndSwap('one', { expectedVersion: read?.version, data: { messages: ['new'] } })
    expect(next).not.toBe(initial)
    expect(await a.compareAndSwap('one', { expectedVersion: initial, data: { messages: ['old'] } })).toBeUndefined()
    expect(await a.query({ objectId: 'owner' })).toEqual([{ messages: ['new'] }])
  })

  it('同快照并发只有一个提交，读取/查询对象无法绕过版本直接改存储', async () => {
    await a.save('one', { messages: ['original'] })
    const read = await a.readVersioned('one')
    const results = await Promise.all(Array.from({ length: 8 }, (_, index) => (index % 2 ? a : b).compareAndSwap('one', { expectedVersion: read?.version, data: { messages: [`winner-${index}`] } })))
    expect(results.filter(Boolean)).toHaveLength(1)
    const current = await a.readVersioned('one')
    current?.data.messages.push('uncommitted')
    const queried = await b.query({})
    queried[0].messages.push('uncommitted-query')
    expect((await a.get('one'))?.messages).toHaveLength(1)
  })

  it('普通单条和批量写入也推进版本，过期条件既不能创建也不能更新', async () => {
    await a.save('one', { messages: [] })
    const first = await a.readVersioned('one')
    await a.saveMany([{ id: 'one', data: { messages: ['batch'] } }])
    const second = await b.readVersioned('one')
    expect(second?.version).not.toBe(first?.version)
    const expired = await a.currentTime() - 1
    expect(await b.compareAndSwap('one', { expectedVersion: second?.version, data: { messages: ['expired'] }, notAfter: expired })).toBeUndefined()
    expect(await b.compareAndSwap('missing', { expectedVersion: undefined, data: { messages: [] }, notAfter: expired })).toBeUndefined()
    expect(await a.get('one')).toEqual({ messages: ['batch'] })
    expect(await a.get('missing')).toBeUndefined()
  })

  if (backend === 'sqlite') {
    it('共享时钟和最终 deadline 不受 Node 墙钟提前两小时影响，数据库故障不返回缺失', async () => {
      const real = Date.now()
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(real + 2 * 60 * 60 * 1000)
      const serverTime = await a.currentTime()
      expect(Math.abs(serverTime - real)).toBeLessThan(5000)
      expect(await a.compareAndSwap('one', { expectedVersion: undefined, data: { messages: ['server-time'] }, notAfter: serverTime + 60_000 })).toBeDefined()
      vi.spyOn(reldb.sql, 'get').mockResolvedValue({ success: false, error: { code: 'hai:reldb:002', message: 'Injected database failure' } })
      await expect(a.readVersioned('one')).rejects.toThrow('Injected database failure')
      await expect(a.currentTime()).rejects.toThrow('Injected database failure')
    })
  }
})
