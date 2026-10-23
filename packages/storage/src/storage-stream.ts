/**
 * @h-ai/storage — 字节流规范化
 *
 * 供存储 Provider 与 checksum 共用，保持消费有界且支持取消。
 */
import type { StorageData } from './storage-types.js'
import { Buffer } from 'node:buffer'
import { storageM } from './storage-i18n.js'

/**
 * 规范化字节输入；取消时终止等待并关闭迭代器，拒绝对象模式流中的非字节块。
 * @param data - 待迭代的字符串、字节数组或异步字节流。
 * @param signal - 可选取消信号；取消时迭代抛出原因。
 * @returns 逐块产生字节的异步可迭代对象；不缓冲整个输入。
 * @example 模块内部上下文
 * ```ts
 * const controller = new AbortController()
 * for await (const chunk of toByteStream('hello', controller.signal)) {
 *   void chunk.byteLength
 * } // 迭代可能因取消或 I/O 抛错，应由上层捕获。
 * ```
 */
export async function* toByteStream(data: StorageData, signal?: AbortSignal): AsyncIterable<Uint8Array> {
  signal?.throwIfAborted()
  if (typeof data === 'string' || data instanceof Uint8Array) {
    yield typeof data === 'string' ? Buffer.from(data) : data
    return
  }
  const iterator = data[Symbol.asyncIterator]()
  let completed = false
  try {
    while (true) {
      signal?.throwIfAborted()
      let result: IteratorResult<Uint8Array>
      let onAbort: (() => void) | undefined
      try {
        // 每块独立等待并释放监听，避免在长流上累积共享 Promise 的回调。
        const cancelled = signal
          ? new Promise<never>((_, reject) => {
              onAbort = () => reject(signal.reason)
              signal.addEventListener('abort', onAbort, { once: true })
            })
          : undefined
        const next = iterator.next()
        result = await (cancelled ? Promise.race([next, cancelled]) : next)
      }
      finally {
        if (onAbort)
          signal?.removeEventListener('abort', onAbort)
      }
      if (result.done) {
        completed = true
        break
      }
      if (!(result.value instanceof Uint8Array))
        throw new TypeError(storageM('storage_streamInvalidChunk'))
      yield result.value
    }
    signal?.throwIfAborted()
  }
  finally {
    if (!completed && iterator.return) {
      // 不可取消的源可能把 return 排在挂起的 next 后面；取消结果不能继续等待源释放。
      if (signal?.aborted)
        void Promise.resolve(iterator.return()).catch(() => {})
      else
        await iterator.return()
    }
  }
}
