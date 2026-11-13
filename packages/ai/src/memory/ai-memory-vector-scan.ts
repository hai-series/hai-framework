import type { AIRelStore, AIVectorStore } from '../store/ai-store-types.js'
import { core } from '@h-ai/core'

/**
 * 向量扫描的共享进度，只有当前领取者可更新。
 * @example
 * ```ts
 * import type { MemoryVectorScanState } from './ai-memory-vector-scan.js'
 * const initial: MemoryVectorScanState = { updatedAt: 0 }
 * ```
 */
export interface MemoryVectorScanState {
  cursor?: string
  /** 下次可领取的数据库时间，已领取时是租约截止时间。 */
  updatedAt: number
}

const logger = core.logger.child({ module: 'ai', scope: 'memory-vector-scan' })
const checkpointId = 'scan'
const pageSize = 64
const pollMs = 1000
const roundPauseMs = 5000
const failureRetryMs = 2000
const leaseMs = 90_000

/**
 * 周期扫描原生记忆的专用向量集合，只清理已无当前关系版本的向量。
 * @example
 * ```ts
 * // 模块内部上下文
 * function schedule(scan: ReturnType<typeof createMemoryVectorScan>) { scan?.start() }
 * ```
 */
export function createMemoryVectorScan<T>(memory: AIRelStore<T>, state: AIRelStore<MemoryVectorScanState>, vectors: AIVectorStore) {
  const currentIds = memory.getMemoryVectorIds?.bind(memory)
  const scan = vectors.scan?.bind(vectors)
  const remove = vectors.removeMany?.bind(vectors)
  if (!currentIds || !scan || !remove)
    return undefined

  const lockedWrite = state.withWriteLock?.bind(state)
  const write = lockedWrite ?? (<R>(update: (store: AIRelStore<MemoryVectorScanState>) => Promise<R>) => update(state))
  let timer: ReturnType<typeof setInterval> | undefined
  let active: Promise<void> | undefined
  let nextCheck = 0

  const run = async () => {
    const now = await state.currentTime()
    const record = await state.readVersioned(checkpointId)
    if (record && record.data.updatedAt > now) {
      nextCheck = performance.now() + Math.min(record.data.updatedAt - now, roundPauseMs)
      return
    }
    const claim = await write(async (checkpoint) => {
      // SQLite 共用连接，领取必须先结束本地事务，再向向量库发请求。
      const current = lockedWrite
        ? await checkpoint.readVersioned(checkpointId)
        : record
      const claimedAt = lockedWrite
        ? await checkpoint.currentTime()
        : now
      if (current && current.data.updatedAt > claimedAt) {
        nextCheck = performance.now() + Math.min(current.data.updatedAt - claimedAt, roundPauseMs)
        return undefined
      }
      const cursor = current?.data.cursor
      const deadline = claimedAt + leaseMs
      const version = await checkpoint.compareAndSwap(checkpointId, {
        expectedVersion: current?.version,
        data: { cursor, updatedAt: deadline },
      })
      return version
        ? { cursor, version, deadline }
        : undefined
    })
    if (!claim) {
      nextCheck = Math.max(nextCheck, performance.now() + pollMs)
      return
    }

    const { cursor, version, deadline } = claim
    let nextCursor = cursor
    let retryIn = failureRetryMs
    try {
      const page = await scan({ cursor, limit: pageSize })
      if (page.items.length > pageSize || (cursor !== undefined && page.nextCursor === cursor))
        throw new Error('Invalid memory vector scan page')
      const ids = [
        ...new Set(page.items.map(point => point.id)),
      ]
      if (ids.length) {
        const current = new Set(await currentIds(ids))
        const obsolete = ids.filter(id => !current.has(id))
        // 向量版本键永不复用，已淘汰的键不会重新成为当前版本。
        if (obsolete.length)
          await remove(obsolete)
      }
      nextCursor = page.nextCursor
      retryIn = nextCursor === undefined
        ? roundPauseMs
        : 0
    }
    catch {
      logger.warn('Memory vector scan page will retry')
    }
    await write(async (checkpoint) => {
      const completedAt = await checkpoint.currentTime()
      await checkpoint.compareAndSwap(checkpointId, {
        expectedVersion: version,
        data: { cursor: nextCursor, updatedAt: completedAt + retryIn },
        notAfter: deadline,
      })
    })
    nextCheck = performance.now() + retryIn
  }

  function kick() {
    if (active || performance.now() < nextCheck)
      return
    active = run().catch(() => {
      nextCheck = performance.now() + failureRetryMs
      logger.warn('Memory vector scan checkpoint unavailable')
    }).finally(() => { active = undefined })
  }

  return {
    start() {
      timer ??= setInterval(kick, pollMs)
      timer.unref()
      kick()
    },
    async close() {
      clearInterval(timer)
      timer = undefined
      await active
    },
  }
}
