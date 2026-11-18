import type { HaiResult, Locale } from '@h-ai/core'
import type { EncryptedPayload } from './crypto-transport-types.js'
import { parentPort } from 'node:worker_threads'
import { core } from '@h-ai/core'
import { createSM2 } from '../crypto-sm2.js'
import { createSM3 } from '../crypto-sm3.js'
import { createSM4 } from '../crypto-sm4.js'
import { TransportBodyTooLargeError } from './crypto-transport-body.js'
import { openTransportPayload, sealTransportPayload } from './crypto-transport-codec.js'

/**
 * 线程只接收单个报文计算所需的密钥和字段，由宿主绑定请求及处理重放保护。
 * @example 模块内部上下文
 * ```ts
 * function jobLocale(job: TransportJob): Locale { return job.locale }
 * ```
 */
export type TransportJob = { locale: Locale } & (
  | { type: 'seal', args: Parameters<typeof sealTransportPayload> extends [unknown, ...infer Args] ? Args : never }
  | { type: 'open', args: Parameters<typeof openTransportPayload> extends [unknown, ...infer Args] ? Args : never }
)

/**
 * 报文计算响应。额外保留跨结构化克隆会丢失的容量异常字段。
 * @example 模块内部上下文
 * ```ts
 * function resultType(reply: TransportReply) { return reply.type }
 * ```
 */
export type TransportReply = {
  oversized?: Pick<TransportBodyTooLargeError, 'limitBytes' | 'actualBytes' | 'direction' | 'stage'>
} & ({ type: 'seal', result: HaiResult<EncryptedPayload> } | { type: 'open', result: HaiResult<string> })

const service = {
  asymmetric: createSM2(),
  hash: createSM3(),
  symmetric: createSM4(),
}
parentPort?.on('message', (job: TransportJob) => {
  const reply = core.i18n.runWithLocale(job.locale, (): TransportReply => job.type === 'seal'
    ? {
        type: 'seal',
        result: sealTransportPayload(service, ...job.args),
      }
    : {
        type: 'open',
        result: openTransportPayload(service, ...job.args),
      })
  if (!reply.result.success && reply.result.error.cause instanceof TransportBodyTooLargeError) {
    const { limitBytes, actualBytes, direction, stage } = reply.result.error.cause
    reply.oversized = {
      limitBytes,
      actualBytes,
      direction,
      stage,
    }
    delete reply.result.error.cause
  }
  parentPort?.postMessage(reply)
})
