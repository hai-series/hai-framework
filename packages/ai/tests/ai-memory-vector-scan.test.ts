/** 扫描器事务边界回归，使用真实 SQLite 连接。 */
import type { MemoryVectorScanState } from '../src/memory/ai-memory-vector-scan.js'
import { setImmediate } from 'node:timers/promises'
import { reldb } from '@h-ai/reldb'
import { expect, it, vi } from 'vitest'
import { createMemoryVectorScan } from '../src/memory/ai-memory-vector-scan.js'
import { createDbStoreProviderFromModules } from '../src/store/providers/ai-store-provider-db.js'

it('waits for unrelated SQLite transactions before claiming and advancing a scan', async () => {
  const provider = createDbStoreProviderFromModules()
  const memory = provider.createRelStore('hai_ai_memory', { hasMemoryVectorIndex: true })
  const checkpoint = provider.createRelStore<MemoryVectorScanState>('hai_ai_memory_vector_scan', { serializeWrites: true })
  await provider.initialize?.()

  const page = Promise.withResolvers<{ items: Array<{ id: string }>, nextCursor: string }>()
  const scan = vi.fn(() => page.promise)
  const worker = createMemoryVectorScan(memory, checkpoint, {
    scan,
    removeMany: async () => {},
    upsert: async () => {},
    remove: async () => {},
    search: async () => [],
    clear: async () => {},
  })!

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
    await worker.close()
    await provider.close?.()
  }
})
