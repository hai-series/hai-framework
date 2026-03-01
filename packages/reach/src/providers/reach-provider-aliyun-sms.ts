/**
 * @h-ai/reach — 阿里云短信 Provider
 *
 * 通过阿里云 SMS HTTP API 发送短信的 Provider 实现（无需 SDK）。
 * @module reach-provider-aliyun-sms
 */

import type { Result } from '@h-ai/core'
import type { AliyunSmsProviderConfig, ProviderConfig } from '../reach-config.js'
import type { ReachError, ReachMessage, ReachProvider, SendResult } from '../reach-types.js'

import { createHmac, randomUUID } from 'node:crypto'
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
 * 对字符串做 RFC 3986 编码
 */
function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/\+/g, '%20')
    .replace(/\*/g, '%2A')
    .replace(/~/g, '%7E')
}

/**
 * 构造阿里云 POP API 签名
 *
 * @param params - 请求参数（不含 Signature）
 * @param accessKeySecret - AccessKey Secret
 * @param method - HTTP 方法
 * @returns 签名值
 */
function signRequest(params: Record<string, string>, accessKeySecret: string, method: string): string {
  const sortedKeys = Object.keys(params).sort()
  const canonicalQuery = sortedKeys
    .map(k => `${percentEncode(k)}=${percentEncode(params[k])}`)
    .join('&')

  const stringToSign = `${method}&${percentEncode('/')}&${percentEncode(canonicalQuery)}`
  // 阿里云 POP API 规范要求使用 HMAC-SHA1 签名
  const hmac = createHmac('sha1', `${accessKeySecret}&`)
  hmac.update(stringToSign)
  return hmac.digest('base64')
}

/**
 * 创建阿里云短信 Provider（直接调用 HTTP API）
 *
 * @returns 阿里云短信 Provider 实例
 */
export function createAliyunSmsProvider(): ReachProvider {
  let smsConfig: AliyunSmsProviderConfig | null = null

  return {
    name: 'aliyun-sms',

    async connect(config: ProviderConfig): Promise<Result<void, ReachError>> {
      if (config.type !== 'aliyun-sms') {
        return err({
          code: ReachErrorCode.CONFIG_ERROR,
          message: reachM('reach_unsupportedType', { params: { type: config.type } }),
        })
      }

      smsConfig = config
      logger.info('Aliyun SMS provider connected', { endpoint: config.endpoint })
      return ok(undefined)
    },

    async close(): Promise<void> {
      smsConfig = null
      logger.info('Aliyun SMS provider disconnected')
    },

    isConnected(): boolean {
      return smsConfig !== null
    },

    async send(message: ReachMessage): Promise<Result<SendResult, ReachError>> {
      if (!smsConfig) {
        return err({
          code: ReachErrorCode.NOT_INITIALIZED,
          message: reachM('reach_notInitialized'),
        })
      }

      const templateCode = message.extra?.templateCode as string | undefined
      logger.debug('Sending SMS', { to: message.to, templateCode })

      try {
        const params: Record<string, string> = {
          AccessKeyId: smsConfig.accessKeyId,
          Action: 'SendSms',
          Format: 'JSON',
          PhoneNumbers: message.to,
          SignName: smsConfig.signName,
          SignatureMethod: 'HMAC-SHA1',
          SignatureNonce: randomUUID(),
          SignatureVersion: '1.0',
          TemplateCode: templateCode ?? '',
          Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
          Version: '2017-05-25',
        }

        if (message.vars) {
          params.TemplateParam = JSON.stringify(message.vars)
        }

        params.Signature = signRequest(params, smsConfig.accessKeySecret, 'GET')

        const queryString = Object.entries(params)
          .map(([k, v]) => `${percentEncode(k)}=${percentEncode(v)}`)
          .join('&')

        const url = `https://${smsConfig.endpoint}/?${queryString}`
        const response = await fetch(url)
        const body = await response.json() as { Code: string, Message: string, BizId?: string }

        if (body.Code !== 'OK') {
          logger.warn('SMS send returned non-OK status', { code: body.Code, message: body.Message })
          return err({
            code: ReachErrorCode.SEND_FAILED,
            message: reachM('reach_smsSendFailed', { params: { error: body.Message } }),
          })
        }

        logger.info('SMS sent', { to: message.to, bizId: body.BizId })
        return ok({ success: true, messageId: body.BizId })
      }
      catch (error) {
        logger.error('SMS send failed', { to: message.to, error })
        return err(toReachError(error))
      }
    },
  }
}
