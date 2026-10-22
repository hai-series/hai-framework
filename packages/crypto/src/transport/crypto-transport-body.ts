/**
 * @h-ai/crypto — 传输协议的字节预算与有界正文读取。
 *
 * serv/kit 共享相同预算，不依赖可省略或伪造的 Content-Length。
 * @module crypto-transport-body
 */

/**
 * 协议固定UTF-8字节预算；按实际流读取，不依赖Content-Length，非字符串字符数限制。
 *
 * @example
 * ```ts
 * import { readTransportBody, TRANSPORT_BODY_LIMITS } from '@h-ai/crypto'
 * const request = new Request('https://api.example.com/api/v1/orders', { method: 'POST', body: JSON.stringify({ message: 'hello' }) })
 * const text = await readTransportBody(request.body, { maxBytes: TRANSPORT_BODY_LIMITS.plaintextBytes, signal: request.signal })
 * ```
 */
export const TRANSPORT_BODY_LIMITS = {
  /** 密钥协商 JSON 的 UTF-8 总字节数。 */
  keyExchangeBytes: 16_384,
  /** GET/HEAD 请求及无正文响应的认证头封装 UTF-8 上限。 */
  envelopeHeaderBytes: 16_384,
  /** 单个协商公钥的 UTF-8 字节数。 */
  publicKeyBytes: 4096,
  /** 解密后的请求/加密前的响应明文字节数。 */
  plaintextBytes: 1_048_576,
  /** 密文 JSON 的 UTF-8 总字节数（2 MiB + 32 KiB，含 CBC 填充与全部认证字段）。 */
  encryptedPayloadBytes: 2_129_920,
} as const

/**
 * 有界原流读取选项；maxBytes是非负安全整数，signal取消等待和底层流。
 *
 * @example
 * ```ts
 * import { readTransportBody, type ReadTransportBodyOptions } from '@h-ai/crypto'
 * const request = new Request('https://api.example.com/api/v1/orders', { method: 'POST', body: 'hello' })
 * const options: ReadTransportBodyOptions = { maxBytes: 1024, signal: request.signal }
 * const text = await readTransportBody(request.body, options)
 * ```
 */
export interface ReadTransportBodyOptions {
  /** 允许读取的字节总数，必须为非负安全整数。 */
  readonly maxBytes: number
  /** 请求取消时中止等待中的读取并取消底层流。 */
  readonly signal?: AbortSignal
}

/**
 * 逐块读取原始字节流并严格UTF-8解码；超限/取消后取消流并释放reader，清理失败不覆盖原异常。
 * 不要传入clone/tee分支，否则另一分支仍可能保留数据。
 * @param stream - 原始流；null返回空串但仍检查取消。
 * @param options - 字节预算与取消信号。
 * @returns 解码文本。
 * @throws RangeError预算无效或超限；非法UTF-8、流异常和signal.reason继续抛出。
 *
 * @example
 * ```ts
 * import { readTransportBody } from '@h-ai/crypto'
 * const request = new Request('https://api.example.com/api/v1/orders', { method: 'POST', body: 'hello' })
 * const text = await readTransportBody(request.body, { maxBytes: 1024, signal: request.signal })
 * ```
 */
export async function readTransportBody(
  stream: ReadableStream<Uint8Array> | null,
  options: ReadTransportBodyOptions,
): Promise<string> {
  if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes < 0)
    throw new RangeError('Invalid transport body byte limit')
  if (!stream) {
    options.signal?.throwIfAborted()
    return ''
  }

  const reader = stream.getReader()
  const signal = options.signal
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let completed = false
  let failure: unknown
  let onAbort: (() => void) | undefined
  try {
    signal?.throwIfAborted()
    const aborted = signal
      ? new Promise<never>((_resolve, reject) => {
          onAbort = () => reject(signal.reason)
          signal.addEventListener('abort', onAbort, { once: true })
        })
      : undefined
    let bytes = 0
    let text = ''
    while (true) {
      const next = reader.read()
      const chunk = await (aborted ? Promise.race([next, aborted]) : next)
      if (chunk.done) {
        completed = true
        return text + decoder.decode()
      }
      bytes += chunk.value.byteLength
      if (bytes > options.maxBytes)
        throw new RangeError('Transport body byte limit exceeded')
      text += decoder.decode(chunk.value, { stream: true })
    }
  }
  catch (error) {
    failure = error
    throw error
  }
  finally {
    if (onAbort)
      signal?.removeEventListener('abort', onAbort)
    if (!completed) {
      // cancel 的底层清理可能拒绝或长期等待，不能覆盖原异常或阻塞拒绝响应。
      try {
        void reader.cancel(failure).catch(() => {})
      }
      catch {}
    }
    reader.releaseLock()
  }
}
