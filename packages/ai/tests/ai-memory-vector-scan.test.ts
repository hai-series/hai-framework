import type { MemoryVectorScanState } from '../src/memory/ai-memory-vector-scan.js'
/** 扫描器事务、调度与恢复回归，使用真实 SQLite 连接。 */
import type { AIVectorStore } from '../src/store/ai-store-types.js'
import { setImmediate } from 'node:timers/promises'
import { reldb } from '@h-ai/reldb'
import { expect, it, vi } from 'vitest'
import { createMemoryVectorScan } from '../src/memory/ai-memory-vector-scan.js'
import { createDbStoreProviderFromModules } from '../src/store/providers/ai-store-provider-db.js'

function vectors(scan: NonNullable<AIVectorStore['scan']>, removeMany: NonNullable<AIVectorStore['removeMany']> = async () => {}): AIVectorStore {
  return {
    scan,
    removeMany,
    upsert: async () => {},
    remove: async () => {},
    search: async () => [],
    clear: async () => {},
  }
}

it('processes a bounded batch per lease and restarts from the saved cursor', async () => {
  const provider = createDbStoreProviderFromModules()
  const memory = provider.createRelStore('hai_ai_memory', { hasMemoryVectorIndex: true })
  const checkpoint = provider.createRelStore<MemoryVectorScanState>('hai_ai_memory_vector_scan', { serializeWrites: true })
  await provider.initialize?.()

  let leaseDeadline = 0
  const scan = vi.fn<NonNullable<AIVectorStore['scan']>>(async ({ cursor, limit }) => {
    expect(limit).toBe(64)
    const page = Number(cursor ?? 0)
    const state = (await checkpoint.readVersioned('scan'))?.data
    if (page % 32 === 0)
      leaseDeadline = state?.updatedAt ?? 0
    // 先确认上一页进度已提交，整个批次继续共用同一个租约。
    expect(state).toMatchObject({ updatedAt: leaseDeadline, leased: true })
    expect(state?.cursor).toBe(cursor)
    return {
      items: [
        { id: `old-${page}` },
      ],
      nextCursor: String(page + 1),
    }
  })
  const remove = vi.fn(async () => {})
  const first = createMemoryVectorScan(memory, checkpoint, vectors(scan, remove))!
  const restarted = createMemoryVectorScan(memory, checkpoint, vectors(scan, remove))!
  vi.useFakeTimers({
    toFake: ['setInterval', 'clearInterval', 'performance'],
  })
  try {
    first.start()
    await setImmediate()
    expect(scan).toHaveBeenCalledTimes(32)
    expect(remove).toHaveBeenCalledTimes(32)
    const released = (await checkpoint.readVersioned('scan'))?.data
    expect(released?.cursor).toBe('32')
    expect(released?.leased).toBeUndefined()
    expect(released?.updatedAt).toBe(leaseDeadline - 89_000)
    await first.close()

    // 模拟数据库时钟进入下个可领批次，并由新工作器接手持久游标。
    await checkpoint.save('scan', { cursor: '32', updatedAt: 0 })
    restarted.start()
    await setImmediate()
    expect(scan).toHaveBeenNthCalledWith(33, { cursor: '32', limit: 64 })
    expect((await checkpoint.readVersioned('scan'))?.data.cursor).toBe('64')
  }
  finally {
    await first.close()
    await restarted.close()
    vi.useRealTimers()
    await provider.close?.()
  }
})

it('starts a new collection from the beginning despite an obsolete checkpoint lease', async () => {
  const provider = createDbStoreProviderFromModules()
  const memory = provider.createRelStore('hai_ai_memory', { hasMemoryVectorIndex: true })
  const checkpoint = provider.createRelStore<MemoryVectorScanState>('hai_ai_memory_vector_scan', { serializeWrites: true })
  await provider.initialize?.()
  await checkpoint.save('scan', { cursor: 'obsolete-page', updatedAt: (await checkpoint.currentTime()) + 60_000 })

  const scan = vi.fn<NonNullable<AIVectorStore['scan']>>(async () => ({ items: [] }))
  const worker = createMemoryVectorScan(memory, checkpoint, vectors(scan), 'isolated-collection')!
  try {
    worker.start()
    await setImmediate()
    expect(scan).toHaveBeenCalledExactlyOnceWith({ cursor: undefined, limit: 64 })
    expect((await checkpoint.readVersioned('scan'))?.data).toMatchObject({ collection: 'isolated-collection' })
  }
  finally {
    await worker.close()
    await provider.close?.()
  }
})

it('waits for unrelated SQLite transactions before claiming and advancing a scan', async () => {
  const provider = createDbStoreProviderFromModules()
  const memory = provider.createRelStore('hai_ai_memory', { hasMemoryVectorIndex: true })
  const checkpoint = provider.createRelStore<MemoryVectorScanState>('hai_ai_memory_vector_scan', { serializeWrites: true })
  await provider.initialize?.()

  const page = Promise.withResolvers<{ items: Array<{ id: string }>, nextCursor: string }>()
  const continuation = Promise.withResolvers<{ items: Array<{ id: string }> }>()
  const scan = vi.fn<NonNullable<AIVectorStore['scan']>>(options => options.cursor ? continuation.promise : page.promise)
  const worker = createMemoryVectorScan(memory, checkpoint, vectors(scan))!

  try {
    const startTx = await reldb.tx.begin()
    expect(startTx.success).toBe(true)
    if (!startTx.success)
      throw new Error(startTx.error.code)
    try {
      worker.start()
      // 等待 SQLite 同步执行器的 SQL Promise 队列完成一轮。
      await setImmediate()
      expect(scan).not.toHaveBeenCalled()
      expect(await checkpoint.readVersioned('scan')).toBeUndefined()
    }
    finally {
      expect(await startTx.data.rollback()).toMatchObject({ success: true })
    }
    await expect.poll(() => scan.mock.calls.length).toBe(1)
    const claimed = await checkpoint.readVersioned('scan')
    expect(claimed).toBeDefined()

    const endTx = await reldb.tx.begin()
    expect(endTx.success).toBe(true)
    if (!endTx.success)
      throw new Error(endTx.error.code)
    try {
      page.resolve({ items: [], nextCursor: 'next' })
      await setImmediate()
      expect(await checkpoint.readVersioned('scan')).toEqual(claimed)
    }
    finally {
      expect(await endTx.data.commit()).toMatchObject({ success: true })
    }
    await expect.poll(async () => (await checkpoint.readVersioned('scan'))?.data.cursor).toBe('next')
  }
  finally {
    page.resolve({ items: [], nextCursor: 'next' })
    continuation.resolve({ items: [] })
    await worker.close()
    await provider.close?.()
  }
})
