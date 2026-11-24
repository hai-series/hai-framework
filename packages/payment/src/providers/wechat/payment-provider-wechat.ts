/**
 * @h-ai/payment — 微信支付 Provider
 *
 * 实现 PaymentProvider 接口，对接微信支付 API v3。
 * @module payment-provider-wechat
 */

import type { HaiResult } from '@h-ai/core'
import type { WechatPayConfig } from '../../payment-config.js'
import type { CreateOrderInput, OrderStatus, PaymentNotifyRequest, PaymentNotifyResult, PaymentOrder, PaymentProvider, RefundInput, RefundResult } from '../../payment-types.js'
import type { WechatOrderRequest } from './payment-wechat-types.js'
import { X509Certificate } from 'node:crypto'
import { core } from '@h-ai/core'
import { paymentM } from '../../payment-i18n.js'
import { HaiPaymentError } from '../../payment-types.js'
import { fetchWithTimeout } from '../payment-provider-http.js'
import { getNotifyHeader } from '../payment-provider-notify.js'
import {
  decryptResource,
  generateNonce,
  getTimestamp,
  signJsapi,
  signRequest,
  verifyWechatSignature,
} from './payment-wechat-sign.js'
import {
  WechatNotifyEnvelopeSchema,
  WechatNotifyResourceSchema,
  WechatOrderQueryResponseSchema,
  WechatRefundResponseSchema,
} from './payment-wechat-types.js'

/** 微信支付 API 基地址 */
const WECHAT_API_BASE = 'https://api.mch.weixin.qq.com'

/**
 * 创建微信支付 Provider
 *
 * @param config - 微信支付配置
 * @returns PaymentProvider 实例
 * @internal
 * @example 模块内部上下文
 * ```ts
 * function createFromTrustedConfig(config: WechatPayConfig) {
 *   // 配置已经由渠道 Schema 解析；真实密钥、商户身份与通知端点由部署提供。
 *   const provider = createWechatPayProvider(config)
 *   const name = provider.name // 'wechat'
 *   return provider
 * }
 * ```
 */
export function createWechatPayProvider(config: WechatPayConfig): PaymentProvider {
  // 公钥迁移时由请求头协商应答签名方式；配置多个公钥 ID 时使用渠道默认值。
  const publicKeyIds = Object.keys(config.platformKeys).filter(serial => serial.startsWith('PUB_KEY_ID_'))
  const requestedSerial = publicKeyIds.length === 1
    ? publicKeyIds[0]
    : undefined

  /**
   * 精确选择受信平台密钥，并校验签名时间和证书有效期。
   * 未知 serial 视为验签失败；配置轮换由宿主受信配置完成。
   * @param body - 微信同步应答或通知的原始正文。
   * @param headers - 微信同步应答或通知携带的签名头。
   * @returns 唯一协议头、当前时间容差、受信 serial/证书及原始体签名均通过时为 true。
   * @example 模块内部上下文
   * ```ts
   * function authenticateNotification(request: PaymentNotifyRequest): boolean {
   *   return verifyChannelMessage(request.body, request.headers)
   *   // 成功后才允许解密资源，随后仍需核对 appId、mchId、订单、金额及持久去重。
   * }
   * ```
   */
  function verifyChannelMessage(body: string | Uint8Array, headers: Record<string, string>): boolean {
    try {
      const timestamp = getNotifyHeader(headers, 'wechatpay-timestamp') ?? ''
      const nonce = getNotifyHeader(headers, 'wechatpay-nonce') ?? ''
      const signature = getNotifyHeader(headers, 'wechatpay-signature') ?? ''
      const serial = getNotifyHeader(headers, 'wechatpay-serial') ?? ''
      const signatureType = getNotifyHeader(headers, 'wechatpay-signature-type')
      const now = Date.now()
      if (!/^(?:0|[1-9]\d{0,11})$/.test(timestamp) || !Number.isSafeInteger(Number(timestamp))
        || Math.abs(Math.floor(now / 1000) - Number(timestamp)) > 300
        || !nonce || !signature || !serial
        || (signatureType !== undefined && signatureType !== 'WECHATPAY2-SHA256-RSA2048')) {
        return false
      }
      const key = Object.hasOwn(config.platformKeys, serial)
        ? config.platformKeys[serial]
        : undefined
      if (!key)
        return false
      if (key.includes('-----BEGIN CERTIFICATE-----')) {
        const certificate = new X509Certificate(key)
        if (certificate.serialNumber.toUpperCase() !== serial.toUpperCase()
          || now < Date.parse(certificate.validFrom) || now > Date.parse(certificate.validTo)) {
          return false
        }
      }
      return verifyWechatSignature(timestamp, nonce, body, signature, key)
    }
    catch {
      return false
    }
  }

  /**
   * 发送微信支付 API 请求，验证成功应答的原始字节及签名，包含 204 空正文。
   */
  async function wechatRequest(method: string, path: string, body?: unknown): Promise<{ status: number, body: Uint8Array }> {
    const timestamp = getTimestamp()
    const nonce = generateNonce()
    const bodyStr = body
      ? JSON.stringify(body)
      : ''

    const signature = signRequest(method, path, timestamp, nonce, bodyStr, config.privateKey)

    const authorization = `WECHATPAY2-SHA256-RSA2048 mchid="${config.mchId}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${config.serialNo}",signature="${signature}"`

    const response = await fetchWithTimeout(`${WECHAT_API_BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authorization,
        'Accept': 'application/json',
        ...(requestedSerial
          ? { 'Wechatpay-Serial': requestedSerial }
          : {}),
      },
      body: bodyStr || undefined,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Wechat API ${method} ${path} failed: ${response.status} ${errorText}`)
    }

    const responseBody = new Uint8Array(await response.arrayBuffer())
    if (!verifyChannelMessage(responseBody, Object.fromEntries(response.headers)))
      throw new Error('Invalid Wechat API response signature')

    return { status: response.status, body: responseBody }
  }

  async function wechatJson(method: string, path: string, body?: unknown): Promise<unknown> {
    const response = await wechatRequest(method, path, body)
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(response.body))
  }

  return {
    name: 'wechat',

    async createOrder(input: CreateOrderInput): Promise<HaiResult<PaymentOrder>> {
      if (input.tradeType !== 'jsapi')
        return core.err(HaiPaymentError.UNSUPPORTED_TRADE_TYPE, paymentM('payment_unsupportedTradeType'))
      if (typeof input.userId !== 'string' || !input.userId.trim() || input.userId.length > 128
        || (input.currency !== undefined && input.currency !== 'CNY')) {
        return core.err(HaiPaymentError.INVALID_INPUT, paymentM('payment_invalidCreateOrderInput'))
      }

      try {
        const requestBody: WechatOrderRequest = {
          appid: config.appId,
          mchid: config.mchId,
          description: input.description,
          out_trade_no: input.orderNo,
          notify_url: input.notifyUrl,
          amount: {
            total: input.amount,
            currency: 'CNY',
          },
          payer: { openid: input.userId },
        }

        if (input.metadata) {
          requestBody.attach = JSON.stringify(input.metadata)
        }

        const response = await wechatJson('POST', '/v3/pay/transactions/jsapi', requestBody)
        if (!response || typeof response !== 'object' || !('prepay_id' in response)
          || typeof response.prepay_id !== 'string' || !response.prepay_id.trim()) {
          throw new Error('Invalid Wechat JSAPI prepay response')
        }

        const timestamp = getTimestamp()
        const nonce = generateNonce()
        const clientParams = {
          appId: config.appId,
          timeStamp: timestamp,
          nonceStr: nonce,
          package: `prepay_id=${response.prepay_id}`,
          signType: 'RSA',
          paySign: signJsapi(config.appId, timestamp, nonce, response.prepay_id, config.privateKey),
        }

        return core.ok({
          provider: 'wechat',
          tradeType: input.tradeType,
          clientParams,
          prepayId: response.prepay_id,
        })
      }
      catch (cause) {
        return core.err(
          HaiPaymentError.CREATE_ORDER_FAILED,
          paymentM('payment_createOrderFailed'),
          cause,
        )
      }
    },

    async handleNotify(request: PaymentNotifyRequest): Promise<HaiResult<PaymentNotifyResult>> {
      try {
        if (!verifyChannelMessage(request.body, request.headers)) {
          return core.err(
            HaiPaymentError.NOTIFY_VERIFY_FAILED,
            paymentM('payment_notifyVerifyFailed'),
          )
        }

        // 解密资源
        const parsedBody = WechatNotifyEnvelopeSchema.safeParse(JSON.parse(request.body))
        if (!parsedBody.success)
          throw new Error('Invalid Wechat payment notification')
        const body = parsedBody.data
        const decrypted = decryptResource(
          body.resource.ciphertext,
          body.resource.nonce,
          body.resource.associated_data ?? '',
          config.apiV3Key,
        )
        const parsedResource = WechatNotifyResourceSchema.safeParse(JSON.parse(decrypted))
        if (!parsedResource.success)
          throw new Error('Invalid Wechat payment notification resource')
        const resource = parsedResource.data
        if (resource.appid !== config.appId || resource.mchid !== config.mchId) {
          return core.err(HaiPaymentError.NOTIFY_VERIFY_FAILED, paymentM('payment_notifyVerifyFailed'))
        }

        return core.ok({
          orderNo: resource.out_trade_no,
          transactionId: resource.transaction_id,
          eventId: body.id,
          amount: resource.amount.total,
          currency: resource.amount.currency,
          status: 'paid',
          paidAt: new Date(resource.success_time),
          raw: resource,
        })
      }
      catch {
        return core.err(
          HaiPaymentError.NOTIFY_PARSE_FAILED,
          paymentM('payment_notifyParseFailed'),
          new Error('Invalid Wechat payment notification'),
        )
      }
    },

    async queryOrder(orderNo: string): Promise<HaiResult<OrderStatus>> {
      try {
        const path = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(orderNo)}?mchid=${encodeURIComponent(config.mchId)}`
        const parsed = WechatOrderQueryResponseSchema.safeParse(await wechatJson('GET', path))
        if (!parsed.success)
          throw new Error('Invalid Wechat order query response')
        const response = parsed.data
        if (response.appid !== config.appId || response.mchid !== config.mchId || response.out_trade_no !== orderNo)
          throw new Error('Wechat order query response identity mismatch')

        const statusMap = {
          SUCCESS: 'paid',
          CLOSED: 'closed',
          REFUND: 'refund_started',
          NOTPAY: 'pending',
          REVOKED: 'closed',
          USERPAYING: 'pending',
          PAYERROR: 'failed',
        } as const satisfies Record<typeof response.trade_state, OrderStatus['status']>

        const amount = response.amount?.total
        return core.ok({
          orderNo: response.out_trade_no,
          transactionId: response.transaction_id || undefined,
          status: statusMap[response.trade_state],
          ...(amount === undefined
            ? {}
            : { amount }),
          paidAt: response.success_time
            ? new Date(response.success_time)
            : undefined,
        })
      }
      catch (cause) {
        return core.err(
          HaiPaymentError.QUERY_ORDER_FAILED,
          paymentM('payment_queryOrderFailed'),
          cause,
        )
      }
    },

    async refund(input: RefundInput): Promise<HaiResult<RefundResult>> {
      try {
        const total = input.totalAmount ?? input.amount
        const result = await wechatJson('POST', '/v3/refund/domestic/refunds', {
          out_trade_no: input.orderNo,
          out_refund_no: input.refundNo,
          amount: {
            refund: input.amount,
            total,
            currency: 'CNY',
          },
          reason: input.reason,
        })

        const parsed = WechatRefundResponseSchema.safeParse(result)
        if (!parsed.success)
          throw new Error('Invalid Wechat refund response')
        const response = parsed.data
        if (response.out_trade_no !== input.orderNo || response.out_refund_no !== input.refundNo
          || response.amount.refund !== input.amount || response.amount.total !== total) {
          throw new Error('Wechat refund response identity or amount mismatch')
        }

        const statusMap = {
          SUCCESS: 'success',
          PROCESSING: 'processing',
          CLOSED: 'failed',
          ABNORMAL: 'failed',
        } as const satisfies Record<typeof response.status, RefundResult['status']>

        return core.ok({
          refundNo: response.out_refund_no,
          refundId: response.refund_id,
          status: statusMap[response.status],
        })
      }
      catch (cause) {
        return core.err(
          HaiPaymentError.REFUND_FAILED,
          paymentM('payment_refundFailed'),
          cause,
        )
      }
    },

    async closeOrder(orderNo: string): Promise<HaiResult<void>> {
      try {
        const response = await wechatRequest('POST', `/v3/pay/transactions/out-trade-no/${encodeURIComponent(orderNo)}/close`, {
          mchid: config.mchId,
        })
        if (response.status !== 204)
          throw new Error(`Unexpected Wechat close order status: ${response.status}`)
        return core.ok(undefined)
      }
      catch (cause) {
        return core.err(
          HaiPaymentError.CLOSE_ORDER_FAILED,
          paymentM('payment_closeOrderFailed'),
          cause,
        )
      }
    },
  }
}
