/**
 * @h-ai/payment — 微信支付 Provider
 *
 * 实现 PaymentProvider 接口，对接微信支付 API v3。
 * @module wechat-pay-provider
 */

import type { HaiResult } from '@h-ai/core'
import type { WechatPayConfig } from '../../payment-config.js'
import type { CreateOrderInput, OrderStatus, PaymentNotifyRequest, PaymentNotifyResult, PaymentOrder, PaymentProvider, RefundInput, RefundResult } from '../../payment-types.js'
import type { WechatOrderRequest } from './wechat-pay-types.js'
import { X509Certificate } from 'node:crypto'
import { err, ok } from '@h-ai/core'
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
  verifyNotifySignature,
} from './wechat-pay-sign.js'
import { WechatNotifyEnvelopeSchema, WechatNotifyResourceSchema } from './wechat-pay-types.js'

/** 微信支付 API 基地址 */
const WECHAT_API_BASE = 'https://api.mch.weixin.qq.com'

/**
 * 创建微信支付 Provider
 *
 * @param config - 微信支付配置
 * @returns PaymentProvider 实例
 *
 * @example
 * ```ts
 * const wechatPay = createWechatPayProvider({
 *   mchId: 'your-mch-id',
 *   apiV3Key: 'your-api-v3-key',
 *   serialNo: 'your-serial-no',
 *   privateKey: fs.readFileSync('apiclient_key.pem', 'utf-8'),
 *   appId: 'your-app-id',
 *   platformKeys: { PUB_KEY_ID_123: platformPublicKeyPem },
 * })
 *
 * const result = await wechatPay.createOrder({
 *   orderNo: 'ORD20240101001',
 *   amount: 100, // 1 元
 *   description: '测试商品',
 *   tradeType: 'jsapi',
 *   userId: 'openid-xxx',
 *   notifyUrl: 'https://api.example.com/payment/notify/wechat',
 * })
 * ```
 */
export function createWechatPayProvider(config: WechatPayConfig): PaymentProvider {
  /**
   * 精确选择受信平台密钥，并校验签名时间和证书有效期。
   * 不联网信任通知携带的未知 serial；配置轮换由宿主受信配置完成。
   */
  function verifyNotification(request: PaymentNotifyRequest): boolean {
    try {
      const timestamp = getNotifyHeader(request.headers, 'wechatpay-timestamp') ?? ''
      const nonce = getNotifyHeader(request.headers, 'wechatpay-nonce') ?? ''
      const signature = getNotifyHeader(request.headers, 'wechatpay-signature') ?? ''
      const serial = getNotifyHeader(request.headers, 'wechatpay-serial') ?? ''
      const signatureType = getNotifyHeader(request.headers, 'wechatpay-signature-type')
      const now = Date.now()
      if (!/^(?:0|[1-9]\d{0,11})$/.test(timestamp) || !Number.isSafeInteger(Number(timestamp))
        || Math.abs(Math.floor(now / 1000) - Number(timestamp)) > 300
        || !nonce || !signature || !serial
        || (signatureType !== undefined && signatureType !== 'WECHATPAY2-SHA256-RSA2048')) {
        return false
      }
      const key = Object.hasOwn(config.platformKeys, serial) ? config.platformKeys[serial] : undefined
      if (!key)
        return false
      if (key.includes('-----BEGIN CERTIFICATE-----')) {
        const certificate = new X509Certificate(key)
        if (certificate.serialNumber.toUpperCase() !== serial.toUpperCase()
          || now < Date.parse(certificate.validFrom) || now > Date.parse(certificate.validTo)) {
          return false
        }
      }
      return verifyNotifySignature(timestamp, nonce, request.body, signature, key)
    }
    catch {
      return false
    }
  }

  /**
   * 发送微信支付 API 请求
   */
  async function wechatRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
    const timestamp = getTimestamp()
    const nonce = generateNonce()
    const bodyStr = body ? JSON.stringify(body) : ''

    const signature = signRequest(method, path, timestamp, nonce, bodyStr, config.privateKey)

    const authorization = `WECHATPAY2-SHA256-RSA2048 mchid="${config.mchId}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${config.serialNo}",signature="${signature}"`

    const response = await fetchWithTimeout(`${WECHAT_API_BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authorization,
        'Accept': 'application/json',
      },
      body: bodyStr || undefined,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Wechat API ${method} ${path} failed: ${response.status} ${errorText}`)
    }

    return response.json() as T
  }

  return {
    name: 'wechat',

    async createOrder(input: CreateOrderInput): Promise<HaiResult<PaymentOrder>> {
      if (input.tradeType !== 'jsapi')
        return err(HaiPaymentError.UNSUPPORTED_TRADE_TYPE, paymentM('payment_unsupportedTradeType'))
      if (typeof input.userId !== 'string' || !input.userId.trim() || input.userId.length > 128
        || (input.currency !== undefined && input.currency !== 'CNY')) {
        return err(HaiPaymentError.INVALID_INPUT, paymentM('payment_invalidCreateOrderInput'))
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

        const response = await wechatRequest<{ prepay_id?: unknown }>('POST', '/v3/pay/transactions/jsapi', requestBody)
        if (typeof response.prepay_id !== 'string' || !response.prepay_id.trim())
          throw new Error('Invalid Wechat JSAPI prepay response')

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

        return ok({
          provider: 'wechat',
          tradeType: input.tradeType,
          clientParams,
          prepayId: response.prepay_id,
        })
      }
      catch (cause) {
        return err(
          HaiPaymentError.CREATE_ORDER_FAILED,
          paymentM('payment_createOrderFailed'),
          cause,
        )
      }
    },

    async handleNotify(request: PaymentNotifyRequest): Promise<HaiResult<PaymentNotifyResult>> {
      try {
        if (!verifyNotification(request)) {
          return err(
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
          return err(HaiPaymentError.NOTIFY_VERIFY_FAILED, paymentM('payment_notifyVerifyFailed'))
        }

        return ok({
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
        return err(
          HaiPaymentError.NOTIFY_PARSE_FAILED,
          paymentM('payment_notifyParseFailed'),
          new Error('Invalid Wechat payment notification'),
        )
      }
    },

    async queryOrder(orderNo: string): Promise<HaiResult<OrderStatus>> {
      try {
        const path = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(orderNo)}?mchid=${encodeURIComponent(config.mchId)}`
        const response = await wechatRequest<{
          out_trade_no: string
          transaction_id: string
          trade_state: string
          amount: { total: number }
          success_time?: string
        }>('GET', path)

        const statusMap: Record<string, OrderStatus['status']> = {
          SUCCESS: 'paid',
          CLOSED: 'closed',
          REFUND: 'refunded',
          NOTPAY: 'pending',
          PAYERROR: 'failed',
        }

        return ok({
          orderNo: response.out_trade_no,
          transactionId: response.transaction_id,
          status: statusMap[response.trade_state] ?? 'pending',
          amount: response.amount.total,
          paidAt: response.success_time ? new Date(response.success_time) : undefined,
        })
      }
      catch (cause) {
        return err(
          HaiPaymentError.QUERY_ORDER_FAILED,
          paymentM('payment_queryOrderFailed'),
          cause,
        )
      }
    },

    async refund(input: RefundInput): Promise<HaiResult<RefundResult>> {
      try {
        const response = await wechatRequest<{
          refund_id: string
          status: string
        }>('POST', '/v3/refund/domestic/refunds', {
          out_trade_no: input.orderNo,
          out_refund_no: input.refundNo,
          amount: {
            refund: input.amount,
            total: input.totalAmount ?? input.amount,
            currency: 'CNY',
          },
          reason: input.reason,
        })

        const statusMap: Record<string, RefundResult['status']> = {
          SUCCESS: 'success',
          PROCESSING: 'processing',
          ABNORMAL: 'failed',
        }

        return ok({
          refundNo: input.refundNo,
          refundId: response.refund_id,
          status: statusMap[response.status] ?? 'processing',
        })
      }
      catch (cause) {
        return err(
          HaiPaymentError.REFUND_FAILED,
          paymentM('payment_refundFailed'),
          cause,
        )
      }
    },

    async closeOrder(orderNo: string): Promise<HaiResult<void>> {
      try {
        await wechatRequest('POST', `/v3/pay/transactions/out-trade-no/${encodeURIComponent(orderNo)}/close`, {
          mchid: config.mchId,
        })
        return ok(undefined)
      }
      catch (cause) {
        return err(
          HaiPaymentError.CLOSE_ORDER_FAILED,
          paymentM('payment_closeOrderFailed'),
          cause,
        )
      }
    },
  }
}
