/**
 * =============================================================================
 * @h-ai/reach - 阿里云短信 Provider
 * =============================================================================
 *
 * 使用阿里云 dysmsapi SDK 发送短信的 Provider 实现。
 *
 * @module reach-provider-aliyun-sms
 * =============================================================================
 */

import type { Result } from '@h-ai/core'
import type { AliyunSmsConfig, ReachConfig } from '../reach-config.js'
import type { ReachError, ReachMessage, ReachProvider, SendResult } from '../reach-types.js'

import { createRequire } from 'node:module'
import { core, err, ok } from '@h-ai/core'

import { ReachErrorCode } from '../reach-config.js'
import { reachM } from '../reach-i18n.js'

const logger = core.logger.child({ module: 'reach', scope: 'provider-aliyun-sms' })

/**
 * 将异常包装为 ReachError
 */
function toReachError(error: unknown): ReachError {
  return {
    code: ReachErrorCode.SEND_FAILED,
    message: reachM('reach_smsSendFailed', {
      params: { error: error instanceof Error ? error.message : String(error) },
    }),
    cause: error,
  }
}

/**
 * 创建阿里云短信 Provider
 *
 * @returns 阿里云短信 Provider 实例
 */
export function createAliyunSmsProvider(): ReachProvider {
  let client: unknown = null
  let smsConfig: AliyunSmsConfig | null = null

  return {
    name: 'aliyun-sms',

    async connect(config: ReachConfig): Promise<Result<void, ReachError>> {
      if (config.type !== 'aliyun-sms') {
        return err({
          code: ReachErrorCode.CONFIG_ERROR,
          message: reachM('reach_unsupportedType', { params: { type: config.type } }),
        })
      }

      try {
        const require = createRequire(import.meta.url)
        const Dysmsapi = require('@alicloud/dysmsapi20170525')
        const OpenApi = require('@alicloud/openapi-client')

        const apiConfig = new OpenApi.Config({
          accessKeyId: config.accessKeyId,
          accessKeySecret: config.accessKeySecret,
          endpoint: config.endpoint,
        })

        const DysmsapiClient = Dysmsapi.default
        client = new DysmsapiClient(apiConfig)
        smsConfig = config

        logger.info('Aliyun SMS provider connected', { endpoint: config.endpoint })
        return ok(undefined)
      }
      catch (error) {
        logger.error('Aliyun SMS connection failed', { error })
        return err(toReachError(error))
      }
    },

    async close(): Promise<void> {
      client = null
      smsConfig = null
      logger.info('Aliyun SMS provider disconnected')
    },

    isConnected(): boolean {
      return client !== null
    },

    async send(message: ReachMessage): Promise<Result<SendResult, ReachError>> {
      if (!client || !smsConfig) {
        return err({
          code: ReachErrorCode.NOT_INITIALIZED,
          message: reachM('reach_notInitialized'),
        })
      }

      logger.debug('Sending SMS', { to: message.to, templateCode: message.templateCode })

      try {
        const require = createRequire(import.meta.url)
        const Dysmsapi = require('@alicloud/dysmsapi20170525')

        const request = new Dysmsapi.SendSmsRequest({
          phoneNumbers: message.to,
          signName: smsConfig.signName,
          templateCode: message.templateCode ?? '',
          templateParam: message.vars ? JSON.stringify(message.vars) : undefined,
        })

        const sendSms = (client as { sendSms: (req: unknown) => Promise<{ body: { code: string, message: string, bizId: string } }> }).sendSms.bind(client)
        const response = await sendSms(request)

        if (response.body.code !== 'OK') {
          logger.warn('SMS send returned non-OK status', { code: response.body.code, message: response.body.message })
          return err({
            code: ReachErrorCode.SEND_FAILED,
            message: reachM('reach_smsSendFailed', { params: { error: response.body.message } }),
          })
        }

        logger.info('SMS sent', { to: message.to, bizId: response.body.bizId })
        return ok({ success: true, messageId: response.body.bizId })
      }
      catch (error) {
        logger.error('SMS send failed', { to: message.to, error })
        return err(toReachError(error))
      }
    },
  }
}
