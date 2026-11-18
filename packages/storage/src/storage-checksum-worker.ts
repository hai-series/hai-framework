import type { ChecksumOptions } from './storage-types.js'
import { createHash } from 'node:crypto'
import { parentPort } from 'node:worker_threads'

/**
 * 为已在内存的内容生成摘要。
 * @example 模块内部上下文
 * ```ts
 * const job: ChecksumJob = { data: 'report', algorithm: 'sha256', encoding: 'hex' }
 * ```
 */
export interface ChecksumJob {
  data: string | Uint8Array
  algorithm: NonNullable<ChecksumOptions['algorithm']>
  encoding: NonNullable<ChecksumOptions['encoding']>
}

parentPort?.on('message', ({ data, algorithm, encoding }: ChecksumJob) => {
  parentPort?.postMessage(createHash(algorithm).update(data).digest(encoding))
})
