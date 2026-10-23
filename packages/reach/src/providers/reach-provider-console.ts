/**
 * @h-ai/reach — Console Provider
 *
 * 开发/测试用 Provider，仅将触达元数据输出到日志，保护验证码和令牌。
 * @module reach-provider-console
 */

import type { HaiResult } from '@h-ai/core'
import type { ProviderConfig } from '../reach-config.js'

import type { ReachMessage, SendResult } from '../reach-types.js'
import type { ReachProvider } from './reach-provider-types.js'
import { core, ok } from '@h-ai/core'

const logger = core.logger.child({ module: 'reach', scope: 'provider-console' })

/**
 * 内部开发/测试日志适配器，不证明真实邮件/短信/API投递；生产守卫拒绝console。
 * @returns 仅本地调试Provider；supportsIdempotency=true表示测试日志可重试，不代表接收端持久去重。
 *
 * @example 模块内部上下文
 * ```ts
 * const provider = createConsoleProvider()
 * const config = { name: 'dev-log', type: 'console' as const }
 * const connected = await provider.connect(config)
 * if (!connected.success) throw new Error(connected.error.message)
 * try { const connectedNow = provider.isConnected(); const retrySafe = provider.supportsIdempotency }
 * finally { await provider.close() }
 * ```
 */
export function createConsoleProvider(): ReachProvider {
  let connected = false

  return {
    name: 'console',
    supportsIdempotency: true,

    async connect(_config: ProviderConfig): Promise<HaiResult<void>> {
      connected = true
      logger.info('Console provider connected')
      return ok(undefined)
    },

    async close(): Promise<void> {
      connected = false
      logger.info('Console provider disconnected')
    },

    isConnected(): boolean {
      return connected
    },

    async send(message: ReachMessage): Promise<HaiResult<SendResult>> {
      logger.debug('Sending message via console', {
        provider: message.provider,
        to: message.to,
        hasSubject: Boolean(message.subject),
        bodyLength: message.body?.length ?? 0,
        template: message.template,
        variableNames: Object.keys(message.vars ?? {}),
      })

      const messageId = `console-${Date.now()}`
      return ok({ success: true, messageId })
    },
  }
}
