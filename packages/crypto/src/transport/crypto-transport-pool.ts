import type { HaiResult } from '@h-ai/core'
import type { TransportCodec } from './crypto-transport-server.js'
import type { TransportJob, TransportReply } from './crypto-transport-worker.js'
import { availableParallelism } from 'node:os'
import { core, err, HaiCommonError } from '@h-ai/core'
import { cryptoM } from '../crypto-i18n.js'
import { HaiCryptoError } from '../crypto-types.js'
import { TransportBodyTooLargeError } from './crypto-transport-body.js'
import { transportAuthenticationFailure } from './crypto-transport-codec.js'

function restoreError<T>(result: HaiResult<T>, oversized: TransportReply['oversized']): HaiResult<T> {
  if (!result.success && oversized) {
    result.error.cause = new TransportBodyTooLargeError(oversized.limitBytes, oversized.actualBytes, oversized)
  }
  return result
}

/**
 * 服务端报文计算池和密码池分别限流，业务密钥查询和 nonce 由宿主管理。
 * @example 模块内部上下文
 * ```ts
 * const transport = createTransportWorkerPool()
 * await transport.close()
 * ```
 */
export function createTransportWorkerPool(): TransportCodec & { close: () => Promise<void> } {
  const pool = core.worker.createPool<TransportJob, TransportReply>(
    new URL(import.meta.url.endsWith('.ts')
      ? '../../dist/crypto-transport-worker.js'
      : './crypto-transport-worker.js', import.meta.url),
    {
      maxWorkers: Math.max(1, Math.min(2, availableParallelism() - 1)),
      maxQueuedJobs: 8,
    },
  )
  return {
    async seal(_service, ...args) {
      const result = await pool.run({
        type: 'seal',
        args,
        locale: core.i18n.getGlobalLocale(),
      })
      if (result.success && result.data.type === 'seal')
        return restoreError(result.data.result, result.data.oversized)
      if (!result.success && result.error.code === HaiCommonError.RATE_LIMIT_EXCEEDED.code)
        return err(HaiCryptoError.TRANSPORT_BUSY, cryptoM('crypto_transportBusy'))
      return err(HaiCommonError.INTERNAL_ERROR, cryptoM('crypto_transportResponseEncryptFailed'))
    },
    async open(_service, ...args) {
      const result = await pool.run({
        type: 'open',
        args,
        locale: core.i18n.getGlobalLocale(),
      })
      if (result.success && result.data.type === 'open')
        return restoreError(result.data.result, result.data.oversized)
      if (!result.success && result.error.code === HaiCommonError.RATE_LIMIT_EXCEEDED.code)
        return err(HaiCryptoError.TRANSPORT_BUSY, cryptoM('crypto_transportBusy'))
      return transportAuthenticationFailure()
    },
    close: pool.close,
  }
}
