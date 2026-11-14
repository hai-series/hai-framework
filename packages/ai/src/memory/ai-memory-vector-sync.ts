import type { AIRelStore, AIVectorStore } from '../store/ai-store-types.js'
import type { MemoryEntry } from './ai-memory-types.js'
import type { MemoryVectorScanState } from './ai-memory-vector-scan.js'
import { randomUUID } from 'node:crypto'
import { core } from '@h-ai/core'
import { createMemoryVectorScan } from './ai-memory-vector-scan.js'

/**
 * 关系记录携带当前向量修订 ID，读取时不会采用旧修订的向量分数。
 * @example
 * ```ts
 * import type { StoredMemory } from './ai-memory-vector-sync.js'
 * function vectorRevision(memory: StoredMemory) { return memory.vectorId ?? memory.id }
 * ```
 */
export interface StoredMemory extends MemoryEntry {
  vectorId?: string
}

/**
 * 持久化的单向量补偿记录。向量内容只从当前关系记录读取。
 * @example
 * ```ts
 * import type { MemoryVectorJob } from './ai-memory-vector-sync.js'
 * const pending: MemoryVectorJob = { memoryId: 'memory-1', updatedAt: 0, attempts: 0 }
 * ```
 */
export interface MemoryVectorJob {
  memoryId: string
  updatedAt: number
  attempts: number
  token?: string
  retireUntil?: number
  cooldown?: boolean
}

const logger = core.logger.child({ module: 'ai', scope: 'memory-vector-sync' })
const pollMs = 1000
const inFlightRetryMs = 45_000
const lateWriteWindowMs = 60_000
const batchSize = 16

function backoff(attempts: number): number {
  return Math.min(30_000, 1000 * 2 ** Math.min(Math.max(attempts - 1, 0), 5))
}

/** 从保存的修订 ID 或已有记录使用的原始 ID 取得向量键。 */
function vectorId(memory: StoredMemory): string {
  return memory.vectorId ?? memory.id
}

/**
 * 为原生记忆初始化补偿队列。支持两个关系 Store 在同一事务中写入的 Provider 才启用。
 * @example
 * ```ts
 * // 模块内部上下文
 * async function start(sync: ReturnType<typeof createMemoryVectorSync>) {
 *   sync?.start()
 *   await sync?.close()
 * }
 * ```
 */
export function createMemoryVectorSync(
  store: AIRelStore<StoredMemory>,
  queue: AIRelStore<MemoryVectorJob>,
  vectors: AIVectorStore,
  scanStore?: AIRelStore<MemoryVectorScanState>,
  collection?: string,
) {
  const lock = store.withRelatedWriteLock?.bind(store)
  if (!lock || !queue.queryKeys)
    return undefined

  const scan = scanStore && createMemoryVectorScan(store, scanStore, vectors, collection)

  function write<R>(run: (memory: AIRelStore<StoredMemory>, pending: AIRelStore<MemoryVectorJob>) => Promise<R>): Promise<R> {
    return lock!(queue, run)
  }

  let active: Promise<void> | undefined
  let timer: ReturnType<typeof setInterval> | undefined

  async function reconcile(id: string) {
    const claimed = await write(async (memory, pending) => {
      const job = await pending.get(id)
      if (!job)
        return undefined
      const now = await pending.currentTime()
      if (job.updatedAt > now)
        return undefined
      const entry = await memory.get(job.memoryId)
      const current = entry?.vector && vectorId(entry) === id
        ? entry
        : undefined
      if (current && job.cooldown) {
        await pending.remove(id)
        return undefined
      }
      const token = randomUUID()
      const next = {
        ...job,
        token,
        attempts: job.attempts + 1,
        updatedAt: now + inFlightRetryMs,
      }
      await pending.save(id, next)
      return { ...next, entry: current }
    })
    if (!claimed)
      return
    let succeeded = false
    try {
      if (claimed.entry?.vector) {
        await vectors.upsert(id, claimed.entry.vector, {
          objectId: claimed.entry.objectId,
          type: claimed.entry.type,
        })
      }
      else {
        await vectors.remove(id)
      }
      succeeded = true
    }
    catch {
      logger.debug('Memory vector sync will retry', {
        operation: claimed.entry ? 'upsert' : 'delete',
      })
    }

    await write(async (_memory, pending) => {
      const job = await pending.get(id)
      if (!job || job.token !== claimed.token)
        return
      const now = await pending.currentTime()
      if (scan && !claimed.entry) {
        // 删除失败由周期扫描接手；清理旧版本不占用待同步队列。
        await pending.remove(id)
        return
      }
      if (!scan && succeeded && claimed.entry && job.attempts > 1) {
        // 重放成功只能确认本次请求。保留短期标记，删除时继续覆盖此前可能迟到的请求。
        await pending.save(id, {
          ...job,
          token: undefined,
          cooldown: true,
          updatedAt: now + lateWriteWindowMs,
        })
        return
      }
      if (succeeded && (scan || !job.retireUntil || job.retireUntil <= now)) {
        await pending.remove(id)
        return
      }
      const delay = backoff(job.attempts)
      await pending.save(id, {
        ...job,
        token: undefined,
        updatedAt: job.retireUntil && succeeded
          ? Math.min(now + delay, job.retireUntil)
          : now + delay,
      })
    })
  }

  async function drain() {
    const now = await queue.currentTime()
    const due = await queue.queryKeys!({ updatedBefore: now + 1, limit: batchSize })
    // 单次扫描有界；同一个进程按序调用外部服务，跨进程由数据库领取。
    for (const { id } of due) {
      if (!timer)
        return
      await reconcile(id)
    }
  }

  function kick() {
    if (timer && !active) {
      active = drain().catch(() => {
        logger.warn('Memory vector compensation storage unavailable')
      }).finally(() => { active = undefined })
    }
  }

  return {
    write,
    kick,
    start() {
      if (!timer) {
        timer = setInterval(kick, pollMs)
        timer.unref()
        kick()
        scan?.start()
      }
    },
    async close() {
      clearInterval(timer)
      timer = undefined
      await Promise.all([
        active,
        scan?.close(),
      ])
    },
    async enqueue(pending: AIRelStore<MemoryVectorJob>, entry: StoredMemory) {
      const now = await pending.currentTime()
      await pending.save(vectorId(entry), { memoryId: entry.id, updatedAt: now, attempts: 0 })
    },
    async retire(pending: AIRelStore<MemoryVectorJob>, entry: StoredMemory) {
      const id = vectorId(entry)
      const prior = await pending.get(id)
      if (prior?.attempts === 0) {
        // 旧修订从未被领取，外部未见过该 ID，可直接折叠掉。
        await pending.remove(id)
        return
      }
      const now = await pending.currentTime()
      await pending.save(id, {
        memoryId: entry.id,
        updatedAt: now,
        attempts: 0,
        ...(!scan && prior && { retireUntil: now + lateWriteWindowMs }),
      })
    },
  }
}
