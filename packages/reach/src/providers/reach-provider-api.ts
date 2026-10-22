/**
 * @h-ai/reach — API 回调 Provider
 *
 * 通用 HTTP API 回调 Provider，通过 HTTP 请求发送触达消息。
 * @module reach-provider-api
 */

import type { HaiError, HaiResult } from '@h-ai/core'
import type { ApiProviderConfig, ProviderConfig } from '../reach-config.js'

import type { ReachMessage, SendResult } from '../reach-types.js'
import type { ReachProvider } from './reach-provider-types.js'
import { core, err, ok } from '@h-ai/core'

import { reachM } from '../reach-i18n.js'
import { HaiReachError } from '../reach-types.js'

const logger = core.logger.child({ module: 'reach', scope: 'provider-api' })

/**
 * 日志只保留源站，去除URL用户信息、路径和查询业务数据，非法URL返回固定占位文本。
 * @param url - 已配置回调URL。
 * @returns 可用于结构化日志的源站。
 *
 * @example 模块内部上下文
 * ```ts
 * const endpoint = getSafeEndpoint('https://notify.example.com/private/path?trace=example')
 * // endpoint仅为https://notify.example.com。
 * ```
 */
function getSafeEndpoint(url: string): string {
  try {
    return new URL(url).origin
  }
  catch {
    return '[invalid-url]'
  }
}

/**
 * 将异常包装为 ReachError
 */
function toReachError(error: unknown): HaiError {
  return {
    code: HaiReachError.SEND_FAILED.code,
    message: reachM('reach_apiSendFailed', {
      params: { error: error instanceof Error ? error.message : String(error) },
    }),
    cause: error,
  }
}

/**
 * 内部HTTP回调适配器工厂，包用户通过reach.init配置Provider；connect不发送网络请求。
 * 只有接收端实际原子持久去重时才支持重试；默认false，稳定queueId放在请求头和JSON。
 * @returns Provider；超时中断不证明远端副作用被撤销。
 *
 * @example 模块内部上下文
 * ```ts
 * const provider = createApiProvider()
 * const { ApiProviderConfigSchema } = await import('@h-ai/reach')
 * const config = ApiProviderConfigSchema.parse({ name: 'webhook', type: 'api', url: 'https://notify.example.com/events', idempotent: false })
 * const connected = await provider.connect(config)
 * if (!connected.success) throw new Error(connected.error.message)
 * try { const connectedNow = provider.isConnected(); const retrySafe = provider.supportsIdempotency }
 * finally { await provider.close() }
 * ```
 */
export function createApiProvider(): ReachProvider {
  let apiConfig: ApiProviderConfig | null = null

  return {
    name: 'api',
    get supportsIdempotency() {
      return apiConfig?.idempotent === true
    },

    async connect(config: ProviderConfig): Promise<HaiResult<void>> {
      if (config.type !== 'api') {
        return err(
          HaiReachError.CONFIG_ERROR,
          reachM('reach_unsupportedType', { params: { type: config.type } }),
        )
      }

      apiConfig = config
      logger.info('API provider connected', { endpoint: getSafeEndpoint(config.url), method: config.method })
      return ok(undefined)
    },

    async close(): Promise<void> {
      apiConfig = null
      logger.info('API provider disconnected')
    },

    isConnected(): boolean {
      return apiConfig !== null
    },

    async send(message: ReachMessage): Promise<HaiResult<SendResult>> {
      if (!apiConfig) {
        return err(
          HaiReachError.NOT_INITIALIZED,
          reachM('reach_notInitialized'),
        )
      }

      logger.debug('Sending via API callback', { endpoint: getSafeEndpoint(apiConfig.url) })

      try {
        const payload = {
          to: message.to,
          subject: message.subject,
          body: message.body,
          template: message.template,
          vars: message.vars,
          extra: message.extra,
          idempotencyKey: message.idempotencyKey,
        }

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), apiConfig.timeout)

        try {
          const headers = new Headers({ 'Content-Type': 'application/json', ...apiConfig.headers })
          if (message.idempotencyKey)
            headers.set('Idempotency-Key', message.idempotencyKey)
          const response = await fetch(apiConfig.url, {
            method: apiConfig.method,
            headers,
            body: JSON.stringify(payload),
            signal: controller.signal,
          })

          if (!response.ok) {
            logger.warn('API callback returned non-OK status', { status: response.status })
            // 明确的客户端拒绝无需自动重试；超时、过早请求及限流仍属于暂时故障。
            const rejected = response.status >= 400 && response.status < 500 && ![408, 425, 429].includes(response.status)
            return err(
              rejected ? HaiReachError.DELIVERY_REJECTED : HaiReachError.SEND_FAILED,
              reachM('reach_apiSendFailed', { params: { error: `HTTP ${response.status}` } }),
            )
          }

          const result = await response.json() as { messageId?: string }
          logger.info('API callback sent', { messageId: result.messageId })
          return ok({ success: true, messageId: result.messageId })
        }
        finally {
          clearTimeout(timeoutId)
        }
      }
      catch (error) {
        logger.error('API callback send failed', { error })
        return err(toReachError(error))
      }
    },
  }
}
