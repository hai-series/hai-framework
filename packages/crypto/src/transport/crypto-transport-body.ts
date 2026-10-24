/**
 * @h-ai/crypto — 传输协议的字节预算与有界正文读取。
 *
 * serv/kit 共享相同预算，不依赖可省略或伪造的 Content-Length。
 * @module crypto-transport-body
 */

import { cryptoM } from '../crypto-i18n.js'
import { HaiCryptoError } from '../crypto-types.js'

/**
 * 传输预算；业务预算由明文容量推导，安全字段保持独立。
 * @example
 * ```ts
 * import { resolveTransportBodyLimits, type TransportBodyLimits } from '@h-ai/crypto'
 * const limits: TransportBodyLimits = resolveTransportBodyLimits(8 * 1024 * 1024)
 * const proxyBytes = limits.encryptedPayloadBytes
 * ```
 */
export interface TransportBodyLimits {
  readonly keyExchangeBytes: number
  readonly envelopeHeaderBytes: number
  readonly publicKeyBytes: number
  readonly plaintextBytes: number
  readonly encryptedPayloadBytes: number
}

/**
 * 业务明文的有效 UTF-8 字节范围：1 KiB～64 MiB；不支持无限制。
 * @example
 * ```ts
 * import { TRANSPORT_PLAINTEXT_RANGE } from '@h-ai/crypto'
 * const maximumBytes = TRANSPORT_PLAINTEXT_RANGE.max
 * ```
 */
export const TRANSPORT_PLAINTEXT_RANGE = Object.freeze({ min: 1024, max: 64 * 1024 * 1024 })

/**
 * 默认UTF-8字节预算；按实际流读取，不依赖Content-Length，非字符串字符数限制。
 *
 * @example
 * ```ts
 * import { readTransportBody, TRANSPORT_BODY_LIMITS } from '@h-ai/crypto'
 * const request = new Request('https://api.example.com/api/v1/orders', { method: 'POST', body: JSON.stringify({ message: 'hello' }) })
 * const text = await readTransportBody(request.body, { maxBytes: TRANSPORT_BODY_LIMITS.plaintextBytes, signal: request.signal })
 * ```
 */
export const TRANSPORT_BODY_LIMITS: TransportBodyLimits = Object.freeze({
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
})

/**
 * 校验单一业务明文容量并推导双向密文预算；返回不可变快照。
 * SM4-CBC 使用十六进制编码，预算为明文的两倍加 32 KiB（填充及认证封装）。
 * @param maxPlaintextBytes - UTF-8 字节数，默认 1 MiB，有效范围 1 KiB～64 MiB 的整数。
 * @returns 明文、密文及独立安全预算。
 * @throws RangeError - 配置无效；不接受字符串、null、无限制或静默回退。
 * @example
 * ```ts
 * import { resolveTransportBodyLimits } from '@h-ai/crypto'
 * const limits = resolveTransportBodyLimits(8 * 1024 * 1024)
 * const nginxLimit = limits.encryptedPayloadBytes
 * ```
 */
export function resolveTransportBodyLimits(maxPlaintextBytes = TRANSPORT_BODY_LIMITS.plaintextBytes): TransportBodyLimits {
  if (!Number.isSafeInteger(maxPlaintextBytes) || maxPlaintextBytes < TRANSPORT_PLAINTEXT_RANGE.min || maxPlaintextBytes > TRANSPORT_PLAINTEXT_RANGE.max)
    throw new RangeError(cryptoM('crypto_transportBodyLimitInvalid'))
  return Object.freeze({ ...TRANSPORT_BODY_LIMITS, plaintextBytes: maxPlaintextBytes, encryptedPayloadBytes: 2 * maxPlaintextBytes + 32_768 })
}

/**
 * 可识别的容量错误；只包含方向、阶段和字节数，不包含报文内容。
 * @example
 * ```ts
 * import { TransportBodyTooLargeError } from '@h-ai/crypto'
 * const error = new TransportBodyTooLargeError(1024, 1025, { direction: 'request', stage: 'plaintext' })
 * const diagnostic = { code: error.code, limitBytes: error.limitBytes, actualBytes: error.actualBytes }
 * ```
 */
export class TransportBodyTooLargeError extends RangeError {
  readonly code = HaiCryptoError.TRANSPORT_PAYLOAD_TOO_LARGE.code
  readonly direction: 'request' | 'response'
  readonly stage: 'plaintext' | 'encrypted' | 'header'
  readonly limitBytes: number
  readonly actualBytes?: number

  constructor(limitBytes: number, actualBytes?: number, options: { direction?: 'request' | 'response', stage?: 'plaintext' | 'encrypted' | 'header' } = {}) {
    super(cryptoM('crypto_transportBodyTooLarge'))
    this.name = 'TransportBodyTooLargeError'
    this.limitBytes = limitBytes
    this.actualBytes = actualBytes
    this.direction = options.direction ?? 'request'
    this.stage = options.stage ?? 'plaintext'
  }
}

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
  /** 超限诊断方向；默认 request。 */
  readonly direction?: 'request' | 'response'
  /** 超限诊断阶段；默认 plaintext。 */
  readonly stage?: 'plaintext' | 'encrypted' | 'header'
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
        throw new TransportBodyTooLargeError(options.maxBytes, bytes, options)
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
