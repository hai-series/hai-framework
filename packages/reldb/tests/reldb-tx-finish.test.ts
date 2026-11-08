/** 三个公开 Provider 共用的事务结束权组装器；控制驱动返回时机核验并发资源归属。 */
import type { DmlOperations } from '../src/reldb-types.js'
import { ok } from '@h-ai/core'
import { expect, it, vi } from 'vitest'
import { HaiReldbError } from '../src/index.js'
import { createTxHandle } from '../src/providers/reldb-tx-assembler.js'

it.each(['commit', 'rollback'] as const)('%s 一旦开始即拒绝并发结束和新查询，连接仅归还一次', async (first) => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const finish = vi.fn(async () => {
    await gate
  })
  const released = vi.fn()
  const query = vi.fn(async () => ok([]))
  const operations: DmlOperations = {
    query,
    get: async () => ok(null),
    execute: async () => ok({ changes: 0 }),
    batch: async () => ok(undefined),
    queryPage: async () => ok({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    }),
  }
  const tx = createTxHandle(operations, {
    commit: finish,
    rollback: finish,
    release: released,
    errorMessage: detail => detail,
  })
  try {
    const pending = tx[first]()
    for (const result of [await tx.commit(), await tx.rollback(), await tx.query('SELECT 1')]) {
      expect(result).toMatchObject({
        success: false,
        error: { code: HaiReldbError.TRANSACTION_FAILED.code },
      })
    }
    expect(query).not.toHaveBeenCalled()
    release()
    expect((await pending).success).toBe(true)
    expect(finish).toHaveBeenCalledTimes(1)
    expect(released).toHaveBeenCalledTimes(1)
  }
  finally { release() }
})
