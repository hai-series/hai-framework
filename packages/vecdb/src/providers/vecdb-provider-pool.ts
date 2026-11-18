import type { VecdbWorkerJob, VecdbWorkerReply } from './vecdb-provider-worker.js'
import { core } from '@h-ai/core'

/**
 * 大批次转换共用同一有界池，空闲时回收可选驱动实例。
 * @example 模块内部上下文
 * ```ts
 * const parsed = await providerPool.run({ kind: 'qdrant', operation: 'count', bytes: new TextEncoder().encode('{"status":"ok","result":{"count":1}}') })
 * ```
 */
export const providerPool = core.worker.createPool<VecdbWorkerJob, VecdbWorkerReply>(
  new URL(import.meta.url.endsWith('.ts')
    ? '../../dist/vecdb-provider-worker.js'
    : './vecdb-provider-worker.js', import.meta.url),
  { maxWorkers: 2, maxQueuedJobs: 4, idleTimeoutMs: 15_000 },
)
