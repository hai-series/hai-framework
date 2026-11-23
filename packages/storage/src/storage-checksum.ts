/** @h-ai/storage — Node 字节内容 checksum 生成与校验，无存储生命周期依赖。 */

import type { HaiResult } from '@h-ai/core'
import type { ChecksumJob } from './storage-checksum-worker.js'
import type { ChecksumOperations, ChecksumOptions, StorageData } from './storage-types.js'
import { Buffer } from 'node:buffer'
import { createHash, timingSafeEqual } from 'node:crypto'
import { core } from '@h-ai/core'
import { storageM } from './storage-i18n.js'
import { toByteStream } from './storage-stream.js'
import { HaiStorageError } from './storage-types.js'

const HEX_CHECKSUM = /^[\da-f]+$/i
const BASE64_CHECKSUM = /^(?:[A-Z\d+/]{4})*(?:[A-Z\d+/]{2}==|[A-Z\d+/]{3}=)?$/i
const ALGORITHMS = new Set([
  'sha256',
  'sha384',
  'sha512',
  'sha1',
  'md5',
])
const checksumPool = core.worker.createPool<ChecksumJob, string>(
  new URL(import.meta.url.endsWith('.ts')
    ? '../dist/storage-checksum-worker.js'
    : './storage-checksum-worker.js', import.meta.url),
  { maxWorkers: 2, maxQueuedJobs: 4, idleTimeoutMs: 15_000 },
)

async function generate(data: StorageData, options: ChecksumOptions = {}): Promise<HaiResult<string>> {
  try {
    const algorithm = options.algorithm ?? 'sha256'
    const encoding = options.encoding ?? 'hex'
    if (!ALGORITHMS.has(algorithm))
      return core.err(HaiStorageError.INVALID_CHECKSUM, storageM('storage_checksumInvalid'))
    options.signal?.throwIfAborted()
    if ((typeof data === 'string' || data instanceof Uint8Array) && data.length >= 1024 * 1024) {
      const result = await checksumPool.run({ data, algorithm, encoding })
      options.signal?.throwIfAborted()
      return result.success
        ? result
        : core.err(HaiStorageError.CHECKSUM_FAILED, storageM('storage_checksumFailed'), result.error)
    }
    const hash = createHash(algorithm)
    for await (const chunk of toByteStream(data, options.signal))
      hash.update(chunk)
    return core.ok(hash.digest(encoding))
  }
  catch (error) {
    return core.err(HaiStorageError.CHECKSUM_FAILED, storageM('storage_checksumFailed'), error)
  }
}

/**
 * Node 端无状态字节校验工具；无需初始化，流只能消费一次。
 * @example 模块内部上下文
 * ```ts
 * const calculated = await checksum.generate('hello', { algorithm: 'sha256' })
 * if (!calculated.success) throw new Error(calculated.error.message)
 * const checked = await checksum.verify('hello', calculated.data)
 * if (!checked.success) throw new Error(checked.error.message)
 * void checked.data
 * ```
 */
export const checksum: ChecksumOperations = {
  generate,
  async verify(data, expected, options = {}) {
    const encoding = options.encoding ?? 'hex'
    const valid = encoding === 'hex'
      ? expected.length % 2 === 0 && HEX_CHECKSUM.test(expected)
      : BASE64_CHECKSUM.test(expected) && expected.length > 0
    if (!valid)
      return core.err(HaiStorageError.INVALID_CHECKSUM, storageM('storage_checksumInvalid'))
    const calculated = await generate(data, options)
    if (!calculated.success)
      return calculated
    const actualBytes = Buffer.from(calculated.data, encoding)
    const expectedBytes = Buffer.from(expected, encoding)
    return core.ok(actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes))
  },
}
