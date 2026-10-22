/**
 * @h-ai/reach — SMTP Email Provider
 *
 * 使用 nodemailer 发送邮件的 Provider 实现。
 * @module reach-provider-smtp
 */

import type { HaiError, HaiResult } from '@h-ai/core'
import type { ProviderConfig, SmtpProviderConfig } from '../reach-config.js'

import type { ReachMessage, SendResult } from '../reach-types.js'
import type { ReachProvider } from './reach-provider-types.js'
import { createRequire } from 'node:module'
import { core, err, ok } from '@h-ai/core'

import { reachM } from '../reach-i18n.js'
import { HaiReachError } from '../reach-types.js'

const logger = core.logger.child({ module: 'reach', scope: 'provider-smtp' })

/**
 * 将异常包装为 ReachError
 */
function toReachError(error: unknown): HaiError {
  return {
    code: HaiReachError.SEND_FAILED.code,
    message: reachM('reach_emailSendFailed', {
      params: { error: error instanceof Error ? error.message : String(error) },
    }),
    cause: error,
  }
}

/**
 * 内部SMTP适配器，惰性加载nodemailer；SMTP无持久接收端幂等保证，已开始发送失败进入unknown。
 * @returns Provider；连接/发送先检查HaiResult，close释放自有传输连接。
 *
 * @example 模块内部上下文
 * ```ts
 * const provider = createSmtpProvider()
 * const { SmtpProviderConfigSchema } = await import('@h-ai/reach')
 * const config = SmtpProviderConfigSchema.parse({ name: 'email', type: 'smtp', host: 'smtp.example.com', from: 'noreply@example.com', user: process.env.HAI_REACH_PROVIDERS_0_USER, pass: process.env.HAI_REACH_PROVIDERS_0_PASS })
 * const connected = await provider.connect(config)
 * if (!connected.success) throw new Error(connected.error.message)
 * try { const connectedNow = provider.isConnected(); const retrySafe = provider.supportsIdempotency }
 * finally { await provider.close() }
 * ```
 */
export function createSmtpProvider(): ReachProvider {
  let transporter: unknown = null
  let smtpConfig: SmtpProviderConfig | null = null

  return {
    name: 'smtp',
    supportsIdempotency: false,

    async connect(config: ProviderConfig): Promise<HaiResult<void>> {
      if (config.type !== 'smtp') {
        return err(
          HaiReachError.CONFIG_ERROR,
          reachM('reach_unsupportedType', { params: { type: config.type } }),
        )
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

    async send(message: ReachMessage): Promise<HaiResult<SendResult>> {
      if (!transporter || !smtpConfig) {
        return err(
          HaiReachError.NOT_INITIALIZED,
          reachM('reach_notInitialized'),
        )
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
