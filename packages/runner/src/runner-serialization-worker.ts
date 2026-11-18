import { Buffer } from 'node:buffer'
import { parentPort } from 'node:worker_threads'
import { parseWorkspaceSnapshot } from './runner-workspace.js'

/**
 * 处理已经通过 I/O 字节上限的制品或工作区快照。
 * @example 模块内部上下文
 * ```ts
 * const job: RunnerSerializationJob = { type: 'snapshot', content: '{}', budget: 1024 }
 * ```
 */
export type RunnerSerializationJob
  = | { type: 'snapshot', content: string, budget: number }
    | { type: 'artifact', bytes: Uint8Array }

parentPort?.on('message', (job: RunnerSerializationJob) => {
  try {
    parentPort?.postMessage(job.type === 'artifact'
      ? Buffer.from(job.bytes.buffer, job.bytes.byteOffset, job.bytes.byteLength).toString('base64')
      : parseWorkspaceSnapshot(job.content, job.budget))
  }
  catch {
    parentPort?.postMessage(undefined)
  }
})
