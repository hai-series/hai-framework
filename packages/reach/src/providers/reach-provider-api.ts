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
 * 日志中仅保留回调源站，避免 URL 用户信息、查询参数和路径泄露凭据或业务标识。
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
 * 创建 API 回调 Provider
 *
 * @returns API 回调 Provider 实例
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
