/**
 * =============================================================================
 * @h-ai/reach - API 回调 Provider
 * =============================================================================
 *
 * 通用 HTTP API 回调 Provider，通过 HTTP 请求发送触达消息。
 *
 * 将消息以 JSON 格式 POST/PUT 到配置的 URL。
 *
 * @module reach-provider-api
 * =============================================================================
 */

import type { Result } from '@h-ai/core'
import type { ApiProviderConfig, ProviderConfig } from '../reach-config.js'
import type { ReachError, ReachMessage, ReachProvider, SendResult } from '../reach-types.js'

import { core, err, ok } from '@h-ai/core'

import { ReachErrorCode } from '../reach-config.js'
import { reachM } from '../reach-i18n.js'

const logger = core.logger.child({ module: 'reach', scope: 'provider-api' })

/**
 * 将异常包装为 ReachError
 */
function toReachError(error: unknown): ReachError {
  return {
    code: ReachErrorCode.SEND_FAILED,
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

    async connect(config: ProviderConfig): Promise<Result<void, ReachError>> {
      if (config.type !== 'api') {
        return err({
          code: ReachErrorCode.CONFIG_ERROR,
          message: reachM('reach_unsupportedType', { params: { type: config.type } }),
        })
      }

      apiConfig = config
      logger.info('API provider connected', { url: config.url, method: config.method })
      return ok(undefined)
    },

    async close(): Promise<void> {
      apiConfig = null
      logger.info('API provider disconnected')
    },

    isConnected(): boolean {
      return apiConfig !== null
    },

    async send(message: ReachMessage): Promise<Result<SendResult, ReachError>> {
      if (!apiConfig) {
        return err({
          code: ReachErrorCode.NOT_INITIALIZED,
          message: reachM('reach_notInitialized'),
        })
      }

      logger.debug('Sending via API callback', { url: apiConfig.url, to: message.to })

      try {
        const payload = {
          to: message.to,
          subject: message.subject,
          body: message.body,
          template: message.template,
          templateCode: message.templateCode,
          vars: message.vars,
        }

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), apiConfig.timeout)

        try {
          const response = await fetch(apiConfig.url, {
            method: apiConfig.method,
            headers: {
              'Content-Type': 'application/json',
              ...apiConfig.headers,
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
          })

          if (!response.ok) {
            const text = await response.text()
            logger.warn('API callback returned non-OK status', { status: response.status, body: text })
            return err({
              code: ReachErrorCode.SEND_FAILED,
              message: reachM('reach_apiSendFailed', { params: { error: `HTTP ${response.status}: ${text}` } }),
            })
          }

          const result = await response.json() as { messageId?: string }
          logger.info('API callback sent', { to: message.to, messageId: result.messageId })
          return ok({ success: true, messageId: result.messageId })
        }
        finally {
          clearTimeout(timeoutId)
        }
      }
      catch (error) {
        logger.error('API callback send failed', { to: message.to, error })
        return err(toReachError(error))
      }
    },
  }
}
