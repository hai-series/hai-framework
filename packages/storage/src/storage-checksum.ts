/** @h-ai/storage — Node 字节内容 checksum 生成与校验，无存储生命周期依赖。 */
import type { HaiResult } from '@h-ai/core'
import type { ChecksumOperations, ChecksumOptions, StorageData } from './storage-types.js'
import { Buffer } from 'node:buffer'
import { createHash, timingSafeEqual } from 'node:crypto'
import { err, ok } from '@h-ai/core'
import { storageM } from './storage-i18n.js'
import { toByteStream } from './storage-stream.js'
import { HaiStorageError } from './storage-types.js'

const HEX_CHECKSUM = /^[\da-f]+$/i
const BASE64_CHECKSUM = /^(?:[A-Z\d+/]{4})*(?:[A-Z\d+/]{2}==|[A-Z\d+/]{3}=)?$/i
const ALGORITHMS = new Set(['sha256', 'sha384', 'sha512', 'sha1', 'md5'])

async function generate(data: StorageData, options: ChecksumOptions = {}): Promise<HaiResult<string>> {
  try {
    const algorithm = options.algorithm ?? 'sha256'
    if (!ALGORITHMS.has(algorithm))
      return err(HaiStorageError.INVALID_CHECKSUM, storageM('storage_checksumInvalid'))
    const hash = createHash(algorithm)
    for await (const chunk of toByteStream(data, options.signal))
      hash.update(chunk)
    return ok(hash.digest(options.encoding ?? 'hex'))
  }
  catch (error) {
    return err(HaiStorageError.CHECKSUM_FAILED, storageM('storage_checksumFailed'), error)
  }
}

export const checksum: ChecksumOperations = {
  generate,
  async verify(data, expected, options = {}) {
    const encoding = options.encoding ?? 'hex'
    const valid = encoding === 'hex'
      ? expected.length % 2 === 0 && HEX_CHECKSUM.test(expected)
      : BASE64_CHECKSUM.test(expected) && expected.length > 0
    if (!valid)
      return err(HaiStorageError.INVALID_CHECKSUM, storageM('storage_checksumInvalid'))
    const calculated = await generate(data, options)
    if (!calculated.success)
      return calculated
    const actualBytes = Buffer.from(calculated.data, encoding)
    const expectedBytes = Buffer.from(expected, encoding)
    return ok(actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes))
  },
}
