import type { HaiResult } from '@h-ai/core'
import type { RunnerExecution, RunnerFunctions, RunnerScope } from '@h-ai/runner'
import type { AIRelStore } from '../store/ai-store-types.js'
import { HaiRunnerError } from '@h-ai/runner'

/**
 * 带版本的清理游标，避免并发写入时删除新版本。
 * @example
 * ```ts
 * // 模块内部上下文
 * const key: Key = { id: 'session-1', updatedAt: 100, version: 'v1' }
 * ```
 */
interface Key { id: string, updatedAt: number, version: string }

/**
 * 受管会话绑定中用于核对 Runner 记录的字段。
 * @example
 * ```ts
 * // 模块内部上下文
 * const worker: LinkedWorker = { workerId: 'worker-1', workerScope: { tenantId: 'tenant', userId: 'user' } }
 * ```
 */
interface LinkedWorker { workerId: string, workerScope: RunnerScope }
const batchSize = 64
const retentionMs = 7 * 24 * 60 * 60 * 1000

function removed(result: HaiResult<RunnerExecution>) {
  return !result.success && result.error.code === HaiRunnerError.NOT_FOUND.code
}

/**
 * 清理 Runner 已淘汰的 ACP 索引记录，保留仍有活动或未知执行的会话与回执。
 * @example 模块内部上下文
 * ```ts
 * async function sweep(maintain: ReturnType<typeof createACPMaintenance>) { await maintain() }
 * ```
 */
export function createACPMaintenance<TBinding extends LinkedWorker, TIntent, TReceipt extends { workerScope: RunnerScope }>(
  runner: Pick<RunnerFunctions, 'get'>,
  stores: { bindings: AIRelStore<TBinding>, intents: AIRelStore<TIntent>, receipts: AIRelStore<TReceipt> },
) {
  const { bindings, intents, receipts } = stores

  function scan<T>(store: AIRelStore<T>, consider: (key: Key) => Promise<boolean>) {
    let cursor: Key | undefined
    return async (updatedBefore: number) => {
      if (!store.queryKeys || !store.removeIfUnchanged)
        return
      const page = await store.queryKeys({ updatedBefore, limit: batchSize }, cursor)
      for (const key of page) {
        if (await consider(key))
          await store.removeIfUnchanged(key.id, key.version)
      }
      cursor = page.length === batchSize
        ? page.at(-1)
        : undefined
    }
  }

  const pruneBindings = scan(bindings, async ({ id, version }) => {
    const record = await bindings.readVersioned(id)
    return record?.version === version && removed(await runner.get(record.data.workerScope, record.data.workerId))
  })
  const pruneIntents = scan(intents, async ({ id }) => !await bindings.get(id))
  const pruneReceipts = scan(receipts, async ({ id, version }) => {
    const record = await receipts.readVersioned(id)
    return record?.version === version && removed(await runner.get(record.data.workerScope, id))
  })

  return async () => {
    const cutoff = await bindings.currentTime() - retentionMs
    // 先删已脱离执行记录的会话，再清理其幂等意图。
    await pruneBindings(cutoff)
    await pruneIntents(cutoff)
    await pruneReceipts(cutoff)
  }
}
