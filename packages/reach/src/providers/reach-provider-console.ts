/**
 * =============================================================================
 * @h-ai/reach - Console Provider
 * =============================================================================
 *
 * 开发/测试用 Provider，将触达消息输出到日志。
 *
 * @module reach-provider-console
 * =============================================================================
 */

import type { Result } from '@h-ai/core'
import type { ReachConfig } from '../reach-config.js'
import type { ReachError, ReachMessage, ReachProvider, SendResult } from '../reach-types.js'

import { core, ok } from '@h-ai/core'

const logger = core.logger.child({ module: 'reach', scope: 'provider-console' })

/**
 * 创建 Console Provider
 *
 * @returns Console Provider 实例
 */
export function createConsoleProvider(): ReachProvider {
  let connected = false

  return {
    name: 'console',

    async connect(_config: ReachConfig): Promise<Result<void, ReachError>> {
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

    async send(message: ReachMessage): Promise<Result<SendResult, ReachError>> {
      logger.info('Sending message via console', {
        channel: message.channel,
        to: message.to,
        subject: message.subject,
        body: message.body,
        template: message.template,
        vars: message.vars,
      })

      const messageId = `console-${Date.now()}`
      return ok({ success: true, messageId })
    },
  }
}
