/**
 * 进程内 Store Provider 行为测试
 */

import { describe, expect, it } from 'vitest'

import { createMemoryStoreProvider } from '../src/store/providers/ai-store-provider-memory.js'

interface Item {
  id: string
  score: number
  type: 'fact' | 'event'
  scope?: Record<string, unknown>
}

describe('createMemoryStoreProvider', () => {
  it('关系存储支持作用域、where、排序和分页', async () => {
    const provider = createMemoryStoreProvider()
    const store = provider.createRelStore<Item>('items')
    await store.save('1', { id: '1', score: 1, type: 'fact', scope: { topicId: 'a' } }, { objectId: 'u1' })
    await store.save('2', { id: '2', score: 3, type: 'event', scope: { topicId: 'a' } }, { objectId: 'u1' })
    await store.save('3', { id: '3', score: 2, type: 'fact', scope: { topicId: 'b' } }, { objectId: 'u2' })

    const filtered = await store.query({
      objectId: 'u1',
      where: { score: { $gte: 1 } },
      scope: { topicId: 'a' },
      orderBy: { field: 'score', direction: 'desc' },
    })
    expect(filtered.map(item => item.id)).toEqual(['2', '1'])

    const page = await store.queryPage(
      { where: { type: { $in: ['fact', 'event'] } }, orderBy: { field: 'score', direction: 'asc' } },
      { offset: 1, limit: 1 },
    )
    expect(page.total).toBe(3)
    expect(page.items.map(item => item.id)).toEqual(['3'])
  })

  it('关系存储按过滤条件删除且 close 释放数据', async () => {
    const provider = createMemoryStoreProvider()
    const store = provider.createRelStore<Item>('items')
    await store.saveMany([
      { id: '1', data: { id: '1', score: 1, type: 'fact' }, scope: { objectId: 'u1' } },
      { id: '2', data: { id: '2', score: 2, type: 'event' }, scope: { objectId: 'u2' } },
    ])

    expect(await store.removeBy({ objectId: 'u1' })).toBe(1)
    expect(await store.count()).toBe(1)
    await provider.close?.()
    expect(await store.count()).toBe(0)
  })

  it('向量存储按元数据过滤并返回余弦相似度排序', async () => {
    const provider = createMemoryStoreProvider()
    const store = provider.createVectorStore('vectors')
    await store.upsert('a', [1, 0], { objectId: 'u1', content: 'A' })
    await store.upsert('b', [0.8, 0.2], { objectId: 'u1', content: 'B' })
    await store.upsert('c', [1, 0], { objectId: 'u2', content: 'C' })

    const matches = await store.search([1, 0], { topK: 2, filter: { objectId: 'u1' } })
    expect(matches.map(item => item.id)).toEqual(['a', 'b'])
    expect(matches[0].content).toBe('A')
  })
})
