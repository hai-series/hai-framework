/**
 * @h-ai/crypto — 传输协议的字节预算与有界正文读取。
 *
 * serv/kit 共享相同预算，不依赖可省略或伪造的 Content-Length。
 * @module crypto-transport-body
 */

/**
 * 传输协议的固定字节上限。
 *
 * 密文预算包含 1 MiB 明文经十六进制编码的扩张及 4 KiB 封装余量。
 * @example
 * ```ts
 * const text = await readTransportBody(request.body, {
 *   maxBytes: TRANSPORT_BODY_LIMITS.keyExchangeBytes,
 *   signal: request.signal,
 * })
 * ```
 */
export const TRANSPORT_BODY_LIMITS = {
  /** 密钥协商 JSON 的 UTF-8 总字节数。 */
  keyExchangeBytes: 16_384,
  /** 单个协商公钥的 UTF-8 字节数。 */
  publicKeyBytes: 4096,
  /** 解密后的请求/加密前的响应明文字节数。 */
  plaintextBytes: 1_048_576,
  /** 密文 JSON 的 UTF-8 总字节数（2 MiB + 4 KiB）。 */
  encryptedPayloadBytes: 2_101_248,
} as const

/**
 * 有界读取选项；maxBytes 按输入 UTF-8 字节计算，不是字符数。
 *
 * @example
 * ```ts
 * const options: ReadTransportBodyOptions = { maxBytes: 16_384, signal: request.signal }
 * ```
 */
export interface ReadTransportBodyOptions {
  /** 允许读取的字节总数，必须为非负安全整数。 */
  readonly maxBytes: number
  /** 请求取消时中止等待中的读取并取消底层流。 */
  readonly signal?: AbortSignal
}

/**
 * 逐块消费正文，在超出字节预算时立即停止并取消流。
 *
 * 直接消费传入流；调用方成功后须用解密/加密结果重建 Request/Response，
 * 不应传入 clone/tee 分支，否则无法保证另一分支不会保留正文。
 *
 * @param stream - 原始请求或响应的字节流；null 返回空字符串。
 * @param options - 字节预算与可选的取消信号。
 * @returns 严格 UTF-8 解码后的正文。
 * @throws RangeError - 预算无效或实际字节超限。
 * @throws TypeError - 非法 UTF-8 或无法取得流 reader。
 * @throws 读取异常或 signal.reason；取消清理的异常不会覆盖原始失败。
 * @example
 * ```ts
 * const text = await readTransportBody(request.body, {
 *   maxBytes: TRANSPORT_BODY_LIMITS.encryptedPayloadBytes,
 *   signal: request.signal,
 * })
 * const payload: unknown = JSON.parse(text)
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
