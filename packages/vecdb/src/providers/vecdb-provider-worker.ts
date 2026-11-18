import type { QdrantResponse, QdrantResponseKind } from './vecdb-qdrant-response.js'
import type { VectorBuffer } from './vecdb-vector-buffer.js'
import { createRequire } from 'node:module'
import { parentPort } from 'node:worker_threads'
import { loadLancedbArrow } from './vecdb-lancedb-arrow.js'
import { decodeQdrantResponse } from './vecdb-qdrant-response.js'
import { preparePgvectorRows } from './vecdb-vector-buffer.js'

/**
 * Provider 传输批次使用纯数据，连接、SQL 和提交状态留在宿主。
 * @example 模块内部上下文
 * ```ts
 * const task: VecdbWorkerJob = { kind: 'qdrant', operation: 'count', bytes: new Uint8Array() }
 * ```
 */
export type VecdbWorkerJob
  = | { kind: 'pgvector', batch: VectorBuffer }
    | { kind: 'lancedb', batch: VectorBuffer, schema?: Uint8Array }
    | { kind: 'qdrant', operation: QdrantResponseKind, bytes: Uint8Array, maxPoints?: number }

/**
 * 指明计算结果的用途和失败类型。
 * @example 模块内部上下文
 * ```ts
 * const failed: VecdbWorkerReply = { kind: 'invalid' }
 * ```
 */
export type VecdbWorkerReply
  = | { kind: 'pgvector', value: ReturnType<typeof preparePgvectorRows> }
    | { kind: 'lancedb', ipc: Uint8Array }
    | { kind: 'qdrant', value: QdrantResponse[QdrantResponseKind] }
    | { kind: 'invalid' }

const require = createRequire(import.meta.url)
parentPort?.on('message', (job: VecdbWorkerJob) => {
  try {
    switch (job.kind) {
      case 'pgvector':
        parentPort?.postMessage({
          kind: 'pgvector',
          value: preparePgvectorRows(job.batch),
        } satisfies VecdbWorkerReply)
        break
      case 'lancedb': {
        const driver = require('@lancedb/lancedb') as typeof import('@lancedb/lancedb')
        const { rows, vectors, dimension } = job.batch
        const records = rows.map((row, index) => ({
          ...row,
          vector: Array.from(vectors.subarray(index * dimension, (index + 1) * dimension)),
        }))
        const arrow = loadLancedbArrow()
        const schema = job.schema
          ? arrow.tableFromIPC(job.schema).schema
          : undefined
        const ipc = arrow.tableToIPC(driver.makeArrowTable(records, { schema }))
        parentPort?.postMessage({ kind: 'lancedb', ipc } satisfies VecdbWorkerReply, ipc.buffer instanceof ArrayBuffer
          ? [ipc.buffer]
          : [])
        break
      }
      case 'qdrant':
        parentPort?.postMessage({
          kind: 'qdrant',
          value: decodeQdrantResponse(job.operation, job.bytes, job.maxPoints),
        } satisfies VecdbWorkerReply)
        break
    }
  }
  catch {
    parentPort?.postMessage({ kind: 'invalid' } satisfies VecdbWorkerReply)
  }
})
