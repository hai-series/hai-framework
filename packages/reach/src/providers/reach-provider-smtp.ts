/**
 * =============================================================================
 * @h-ai/reach - SMTP Email Provider
 * =============================================================================
 *
 * 使用 nodemailer 发送邮件的 Provider 实现。
 *
 * @module reach-provider-smtp
 * =============================================================================
 */

import type { Result } from '@h-ai/core'
import type { ProviderConfig, SmtpProviderConfig } from '../reach-config.js'
import type { ReachError, ReachMessage, ReachProvider, SendResult } from '../reach-types.js'

import { createRequire } from 'node:module'
import { core, err, ok } from '@h-ai/core'

import { ReachErrorCode } from '../reach-config.js'
import { reachM } from '../reach-i18n.js'

const logger = core.logger.child({ module: 'reach', scope: 'provider-smtp' })

/**
 * 将异常包装为 ReachError
 */
function toReachError(error: unknown): ReachError {
  return {
    code: ReachErrorCode.SEND_FAILED,
    message: reachM('reach_emailSendFailed', {
      params: { error: error instanceof Error ? error.message : String(error) },
    }),
    cause: error,
  }
}

/**
 * 创建 SMTP Provider
 *
 * @returns SMTP Provider 实例
 */
export function createSmtpProvider(): ReachProvider {
  let transporter: unknown = null
  let smtpConfig: SmtpProviderConfig | null = null

  return {
    name: 'smtp',

    async connect(config: ProviderConfig): Promise<Result<void, ReachError>> {
      if (config.type !== 'smtp') {
        return err({
          code: ReachErrorCode.CONFIG_ERROR,
          message: reachM('reach_unsupportedType', { params: { type: config.type } }),
        })
      }

      try {
        const require = createRequire(import.meta.url)
        const nodemailer = require('nodemailer')

        smtpConfig = config
        transporter = nodemailer.createTransport({
          host: config.host,
          port: config.port,
          secure: config.secure,
          auth: config.user
            ? { user: config.user, pass: config.pass }
            : undefined,
        })

        logger.info('SMTP provider connected', { host: config.host, port: config.port })
        return ok(undefined)
      }
      catch (error) {
        logger.error('SMTP connection failed', { error })
        return err(toReachError(error))
      }
    },

    async close(): Promise<void> {
      if (transporter && typeof (transporter as Record<string, unknown>).close === 'function') {
        (transporter as { close: () => void }).close()
      }
      transporter = null
      smtpConfig = null
      logger.info('SMTP provider disconnected')
    },

    isConnected(): boolean {
      return transporter !== null
    },

    async send(message: ReachMessage): Promise<Result<SendResult, ReachError>> {
      if (!transporter || !smtpConfig) {
        return err({
          code: ReachErrorCode.NOT_INITIALIZED,
          message: reachM('reach_notInitialized'),
        })
      }

      logger.debug('Sending email', { to: message.to, subject: message.subject })

      try {
        const sendMail = (transporter as { sendMail: (opts: unknown) => Promise<{ messageId: string }> }).sendMail.bind(transporter)
        const info = await sendMail({
          from: smtpConfig.from,
          to: message.to,
          subject: message.subject ?? '',
          html: message.body ?? '',
        })

        logger.info('Email sent', { to: message.to, messageId: info.messageId })
        return ok({ success: true, messageId: info.messageId })
      }
      catch (error) {
        logger.error('Email send failed', { to: message.to, error })
        return err(toReachError(error))
      }
    },
  }
}
