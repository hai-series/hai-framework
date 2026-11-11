/**
 * @h-ai/storage — 字节流规范化
 *
 * 供存储 Provider 与 checksum 共用，保持消费有界且支持取消。
 */
import type { HaiResult } from '@h-ai/core'
import type { FileMetadata, StorageData } from './storage-types.js'
import { Buffer } from 'node:buffer'
import { finished, Readable } from 'node:stream'
import { err } from '@h-ai/core'
import { storageM } from './storage-i18n.js'
import { HaiStorageError } from './storage-types.js'

/**
 * 保护调用方已经打开的上传源，并将源读取失败与目标写入失败区分。
 * @example 模块内部上下文
 * ```ts
 * function upload(data: StorageData, write: (input: StorageData) => Promise<HaiResult<FileMetadata>>) {
 *   return uploadWithSource(data, undefined, write)
 * }
 * ```
 */
export async function uploadWithSource(
  data: StorageData,
  signal: AbortSignal | undefined,
  write: (input: StorageData) => Promise<HaiResult<FileMetadata>>,
): Promise<HaiResult<FileMetadata>> {
  const readable = data instanceof Readable
    ? data
    : undefined
  if (readable) {
    // createReadStream 可能在 Provider 等待目标准备或加载 SDK 时就发出打开错误。
    const cleanup = finished(readable, { readable: true, writable: false }, () => cleanup())
  }
  let sourceFailure: Error | undefined
  function failReading(cause: unknown): never {
    // Node 流只能可靠传播 Error，调用方仍收到原始抛出值作为 cause。
    sourceFailure = new Error('Storage upload source failed', { cause })
    throw sourceFailure
  }
  function track(source: AsyncIterable<Uint8Array>): AsyncIterable<Uint8Array> {
    return {
      [Symbol.asyncIterator]() {
        let iterator: AsyncIterator<Uint8Array>
        try {
          iterator = source[Symbol.asyncIterator]()
        }
        catch (cause) {
          return failReading(cause)
        }
        return {
          async next() {
            try {
              return await iterator.next()
            }
            catch (cause) {
              return failReading(cause)
            }
          },
          return: iterator.return?.bind(iterator),
        }
      },
    }
  }
  try {
    const input = typeof data === 'string' || data instanceof Uint8Array || readable
      ? data
      : track(data)
    const result = await write(input)
    if (result.success)
      return result
    const { cause } = result.error
    const readFailure = sourceFailure
    const failedInput = readFailure !== undefined && cause === readFailure
    const originalCause = failedInput ? readFailure.cause : cause
    if (signal?.aborted && (Object.is(originalCause, signal.reason) || (originalCause instanceof Error && originalCause.name === 'AbortError'))) {
      return err({
        ...result.error,
        message: storageM('storage_uploadCanceled'),
        cause: signal.reason,
      })
    }
    if (failedInput || (readable?.errored && readable.errored === cause)) {
      return err({
        ...HaiStorageError.UPLOAD_FAILED,
        message: storageM('storage_uploadSourceReadFailed'),
        cause: originalCause,
        ...result.error.ext && { ext: result.error.ext },
      })
    }
    return result
  }
  finally {
    // 预取消、初始化和目标校验失败可能还未开始消费源，仍需释放文件描述符。
    if (readable && !readable.readableEnded && !readable.destroyed)
      readable.destroy()
  }
}

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
    yield typeof data === 'string'
      ? Buffer.from(data)
      : data
    return
  }
  const iterator = data[Symbol.asyncIterator]()
  let completed = false
  let failed = false
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
        result = await (cancelled
          ? Promise.race([next, cancelled])
          : next)
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
  catch (error) {
    failed = true
    throw error
  }
  finally {
    if (!completed && iterator.return) {
      // 保留首个读取/取消错误。不可取消的迭代器可能让 return 等待挂起的 next。
      const closed = Promise.resolve().then(() => iterator.return?.())
      if (failed || signal?.aborted)
        void closed.catch(() => {})
      else
        await closed
    }
  }
}
