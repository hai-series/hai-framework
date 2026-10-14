/**
 * @h-ai/storage — 字节流规范化
 *
 * 供存储 Provider 与 checksum 共用，保持消费有界且支持取消。
 */
import type { StorageData } from './storage-types.js'
import { Buffer } from 'node:buffer'
import { storageM } from './storage-i18n.js'

/** 规范化字节输入；每次迭代前检查取消，拒绝对象模式流中的非字节块。 */
export async function* toByteStream(data: StorageData, signal?: AbortSignal): AsyncIterable<Uint8Array> {
  signal?.throwIfAborted()
  if (typeof data === 'string' || data instanceof Uint8Array) {
    yield typeof data === 'string' ? Buffer.from(data) : data
    return
  }
  for await (const chunk of data) {
    signal?.throwIfAborted()
    if (!(chunk instanceof Uint8Array))
      throw new TypeError(storageM('storage_streamInvalidChunk'))
    yield chunk
  }
  signal?.throwIfAborted()
}
