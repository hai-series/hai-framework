/** 三个公开 Provider 共用的事务结束权组装器；控制驱动返回时机核验并发资源归属。 */
import type { DmlOperations } from '../src/reldb-types.js'
import { core } from '@h-ai/core'
import { expect, it, vi } from 'vitest'
import { HaiReldbError } from '../src/index.js'
import { createTxHandle } from '../src/providers/reldb-tx-assembler.js'

it.each(['commit', 'rollback'] as const)('%s 拒绝新操作并等待已接受的失败查询，连接仅归还一次', async (first) => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const finish = vi.fn(async () => {
    await gate
  })
  const released = vi.fn()
  let finishQuery!: () => void
  const queryGate = new Promise<void>((resolve) => {
    finishQuery = resolve
  })
  const queryError = new Error('driver query rejected')
  const query = vi.fn(async () => {
    await queryGate
    throw queryError
  })
  const operations: DmlOperations = {
    query,
    get: async () => core.ok(null),
    execute: async () => core.ok({ changes: 0 }),
    batch: async () => core.ok(undefined),
    queryPage: async () => core.ok({
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
    const accepted = tx.query('SELECT 1')
    const queryRejected = expect(accepted).rejects.toBe(queryError)
    const pending = tx[first]()
    for (const result of [await tx.commit(), await tx.rollback(), await tx.query('SELECT 2')]) {
      expect(result).toMatchObject({
        success: false,
        error: { code: HaiReldbError.TRANSACTION_FAILED.code },
      })
    }
    expect(query).toHaveBeenCalledExactlyOnceWith('SELECT 1', undefined)
    expect(finish).not.toHaveBeenCalled()
    expect(released).not.toHaveBeenCalled()
    finishQuery()
    await queryRejected
    release()
    expect((await pending).success).toBe(true)
    expect(finish).toHaveBeenCalledTimes(1)
    expect(released).toHaveBeenCalledTimes(1)
  }
  finally {
    finishQuery()
    release()
  }
})
