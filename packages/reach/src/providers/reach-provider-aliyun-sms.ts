/**
 * @h-ai/reach — 阿里云短信 Provider
 *
 * 通过阿里云 SMS HTTP API 发送短信的 Provider 实现（无需 SDK）。
 * @module reach-provider-aliyun-sms
 */

import type { HaiError, HaiResult } from '@h-ai/core'
import type { AliyunSmsProviderConfig, ProviderConfig } from '../reach-config.js'

import type { ReachGatewayHook, ReachMessage, SendResult } from '../reach-types.js'
import type { ReachProvider } from './reach-provider-types.js'
import { createHmac, randomUUID } from 'node:crypto'
import { addAbortListener } from 'node:events'
import { core, err, ok } from '@h-ai/core'

import { ReachGatewayFieldsSchema } from '../reach-gateway-config.js'
import { reachM } from '../reach-i18n.js'
import { HaiReachError } from '../reach-types.js'

const logger = core.logger.child({ module: 'reach', scope: 'provider-aliyun-sms' })
const ISO_MILLISECONDS_SUFFIX_REGEX = /\.\d{3}Z$/
const RFC3986_RESERVED_CHARACTERS_REGEX = /[!'()*]/g
const GATEWAY_TIMEOUT_MS = 10_000
const GATEWAY_RESPONSE_LIMIT_BYTES = 64 * 1024

/**
 * 将异常包装为 ReachError
 */
function toReachError(): HaiError {
  return {
    ...HaiReachError.SEND_FAILED,
    message: reachM('reach_smsSendFailed'),
  }
}

/**
 * 对字符串做 RFC 3986 编码
 */
function percentEncode(str: string): string {
  return encodeURIComponent(str).replace(RFC3986_RESERVED_CHARACTERS_REGEX, char =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
}

/**
 * 按阿里云POP规范排序/编码并执行HMAC-SHA1；不能替换为框架默认HMAC-SM3。
 * @param params - 不含Signature的请求参数。
 * @param accessKeySecret - 私有Secret，禁止写日志。
 * @param method - 实际HTTP方法。
 * @returns Base64签名，只用于对应请求。
 *
 * @example 模块内部上下文
 * ```ts
 * const secret = process.env.HAI_REACH_PROVIDERS_0_ACCESSKEYSECRET
 * if (!secret) throw new Error('Missing SMS credential')
 * const signature = signRequest({ Action: 'SendSms', Format: 'JSON' }, secret, 'POST')
 * ```
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

/** 网关只接受由 Provider 生成的已签名 URL；函数只可覆盖头和正文。 */
async function prepareGatewayRequest(gateway: NonNullable<AliyunSmsProviderConfig['gateway']>, url: string, signal: AbortSignal, hook?: ReachGatewayHook): Promise<RequestInit> {
  let body = gateway.body
  const headers = new Headers()
  for (const [name, value] of Object.entries(gateway.headers ?? {}))
    headers.set(name, value)
  if (hook) {
    signal.throwIfAborted()
    let listener: ReturnType<typeof addAbortListener> | undefined
    const aborted = new Promise<never>((_resolve, reject) => {
      listener = addAbortListener(signal, () => reject(signal.reason))
    })
    try {
      const output = await Promise.race([
        Promise.resolve().then(() => hook({
          method: 'POST',
          url,
          body: typeof body === 'string'
            ? body
            : JSON.stringify(body),
          signal,
        })),
        aborted,
      ])
      const patch = ReachGatewayFieldsSchema.parse(output === undefined
        ? {}
        : output)
      body = patch.body ?? body
      for (const [name, value] of Object.entries(patch.headers ?? {}))
        headers.set(name, value)
    }
    finally {
      listener?.[Symbol.dispose]()
    }
  }
  if (body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', typeof body === 'string'
      ? 'text/plain; charset=utf-8'
      : 'application/json')
  }
  return {
    method: 'POST',
    headers,
    body: typeof body === 'string'
      ? body
      : JSON.stringify(body),
    redirect: 'error',
    signal,
  }
}

/** 只接受有界的阿里云成功回执，拒绝网关自己的空成功响应。 */
async function readGatewayResponse(response: Response): Promise<HaiResult<SendResult>> {
  if (response.ok && response.body) {
    let bytes = 0
    const stream = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        bytes += chunk.byteLength
        if (bytes > GATEWAY_RESPONSE_LIMIT_BYTES)
          throw new Error('SMS gateway response exceeded the size limit')
        controller.enqueue(chunk)
      },
    }))
    const body: unknown = await new Response(stream).json()
    if (body && typeof body === 'object' && 'Code' in body && body.Code === 'OK') {
      const messageId = 'BizId' in body
        ? body.BizId
        : undefined
      if (messageId === undefined || (typeof messageId === 'string' && messageId.length <= 255))
        return ok({ success: true, messageId })
    }
  }
  else {
    await response.body?.cancel()
  }
  logger.warn('SMS gateway returned an unsuccessful receipt', { status: response.status })
  return err(HaiReachError.SEND_FAILED, reachM('reach_smsGatewayFailed'))
}

/**
 * 内部阿里云POP短信适配器，使用平台指定的HMAC-SHA1签名，不用框架HMAC-SM3替代。
 * 短信发送无接收端持久幂等声明，已开始后失败不自动接管重发。
 * @param gatewayHook - 仅网关模式发送前使用的服务端函数。
 * @returns Provider；私有AccessKey由配置注入，不进入示例常量或日志。
 *
 * @example 模块内部上下文
 * ```ts
 * const provider = createAliyunSmsProvider()
 * const { AliyunSmsProviderConfigSchema } = await import('@h-ai/reach')
 * const config = AliyunSmsProviderConfigSchema.parse({ name: 'sms', type: 'aliyun-sms', accessKeyId: process.env.HAI_REACH_PROVIDERS_0_ACCESSKEYID, accessKeySecret: process.env.HAI_REACH_PROVIDERS_0_ACCESSKEYSECRET, signName: process.env.HAI_REACH_PROVIDERS_0_SIGNNAME })
 * const connected = await provider.connect(config)
 * if (!connected.success) throw new Error(connected.error.message)
 * try { const connectedNow = provider.isConnected(); const retrySafe = provider.supportsIdempotency }
 * finally { await provider.close() }
 * ```
 */
export function createAliyunSmsProvider(gatewayHook?: ReachGatewayHook): ReachProvider {
  let smsConfig: AliyunSmsProviderConfig | null = null

  return {
    name: 'aliyun-sms',
    supportsIdempotency: false,

    async connect(config: ProviderConfig): Promise<HaiResult<void>> {
      if (config.type !== 'aliyun-sms') {
        return err(
          HaiReachError.CONFIG_ERROR,
          reachM('reach_unsupportedType', {
            params: { type: config.type },
          }),
        )
      }

      smsConfig = config
      logger.info('Aliyun SMS provider connected', config.gateway
        ? { gateway: true }
        : { endpoint: config.endpoint })
      return ok(undefined)
    },

    async close(): Promise<void> {
      smsConfig = null
      logger.info('Aliyun SMS provider disconnected')
    },

    isConnected(): boolean {
      return smsConfig !== null
    },

    async send(message: ReachMessage): Promise<HaiResult<SendResult>> {
      const config = smsConfig
      if (!config) {
        return err(
          HaiReachError.NOT_INITIALIZED,
          reachM('reach_notInitialized'),
        )
      }

      const templateCode = message.extra?.templateCode as string | undefined
      if (!config.gateway)
        logger.debug('Sending SMS', { templateCode })

      try {
        const params: Record<string, string> = {
          AccessKeyId: config.accessKeyId,
          Action: 'SendSms',
          Format: 'JSON',
          PhoneNumbers: message.to,
          SignName: config.signName,
          SignatureMethod: 'HMAC-SHA1',
          SignatureNonce: randomUUID(),
          SignatureVersion: '1.0',
          TemplateCode: templateCode ?? '',
          Timestamp: new Date().toISOString().replace(ISO_MILLISECONDS_SUFFIX_REGEX, 'Z'),
          Version: '2017-05-25',
        }

        if (message.vars) {
          params.TemplateParam = JSON.stringify(message.vars)
        }

        params.Signature = signRequest(params, config.accessKeySecret, config.gateway ? 'POST' : 'GET')

        const queryString = Object.entries(params)
          .map(([k, v]) => `${percentEncode(k)}=${percentEncode(v)}`)
          .join('&')

        if (config.gateway) {
          const deadline = performance.now() + GATEWAY_TIMEOUT_MS
          const signal = AbortSignal.timeout(GATEWAY_TIMEOUT_MS)
          const url = `${new URL(config.gateway.url).href}?${queryString}`
          const request = await prepareGatewayRequest(config.gateway, url, signal, gatewayHook)
          signal.throwIfAborted()
          if (smsConfig !== config || performance.now() >= deadline)
            return err(HaiReachError.SEND_FAILED, reachM('reach_smsGatewayFailed'))
          if (message.sensitive && message.expiresAt !== undefined && Date.now() >= message.expiresAt)
            return err(HaiReachError.MESSAGE_EXPIRED, reachM('reach_messageExpired'))
          return await readGatewayResponse(await fetch(url, request))
        }

        const url = `https://${config.endpoint}/?${queryString}`
        const response = await fetch(url)
        const body = await response.json() as { Code: string, Message: string, BizId?: string }

        if (body.Code !== 'OK') {
          // 阿里云签名错误的描述可能回显包含短信变量的原始签名参数。
          logger.warn('SMS send returned non-OK status', { code: body.Code })
          return err(
            HaiReachError.SEND_FAILED,
            reachM('reach_smsSendFailed'),
          )
        }

        logger.info('SMS sent', { bizId: body.BizId })
        return ok({ success: true, messageId: body.BizId })
      }
      catch (error) {
        if (config.gateway) {
          logger.warn('SMS gateway request failed', {
            causeName: error instanceof Error
              ? error.name
              : undefined,
          })
          return err(HaiReachError.SEND_FAILED, reachM('reach_smsGatewayFailed'))
        }
        logger.warn('SMS send failed', {
          causeName: error instanceof Error
            ? error.name
            : undefined,
        })
        return err(toReachError())
      }
    },
  }
}
