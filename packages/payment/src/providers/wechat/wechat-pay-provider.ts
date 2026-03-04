/**
 * @h-ai/payment — 微信支付 Provider
 *
 * 实现 PaymentProvider 接口，对接微信支付 API v3。
 * @module wechat-pay-provider
 */

import type { Result } from '@h-ai/core'
import type {
  CreateOrderInput,
  OrderStatus,
  PaymentError,
  PaymentNotifyRequest,
  PaymentNotifyResult,
  PaymentOrder,
  PaymentProvider,
  RefundInput,
  RefundResult,
  WechatPayConfig,
} from '../../payment-types.js'
import type { WechatNotifyResource, WechatOrderRequest } from './wechat-pay-types.js'
import { err, ok } from '@h-ai/core'
import { paymentM } from '../../payment-i18n.js'
import { PaymentErrorCode } from '../../payment-types.js'
import {
  decryptResource,
  generateNonce,
  getTimestamp,
  signJsapi,
  signRequest,
  verifyNotifySignature,
} from './wechat-pay-sign.js'

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
   * 发送微信支付 API 请求
   */
  async function wechatRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
    const timestamp = getTimestamp()
    const nonce = generateNonce()
    const bodyStr = body ? JSON.stringify(body) : ''

    const signature = signRequest(method, path, timestamp, nonce, bodyStr, config.privateKey)

    const authorization = `WECHATPAY2-SHA256-RSA2048 mchid="${config.mchId}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${config.serialNo}",signature="${signature}"`

    const response = await fetch(`${WECHAT_API_BASE}${path}`, {
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

  /** 根据 tradeType 映射到微信 API 路径 */
  function getOrderPath(tradeType: string): string {
    const map: Record<string, string> = {
      jsapi: '/v3/pay/transactions/jsapi',
      h5: '/v3/pay/transactions/h5',
      app: '/v3/pay/transactions/app',
      native: '/v3/pay/transactions/native',
    }
    return map[tradeType] ?? '/v3/pay/transactions/jsapi'
  }

  return {
    name: 'wechat',

    async createOrder(input: CreateOrderInput): Promise<Result<PaymentOrder, PaymentError>> {
      try {
        const requestBody: WechatOrderRequest = {
          appid: config.appId,
          mchid: config.mchId,
          description: input.description,
          out_trade_no: input.orderNo,
          notify_url: input.notifyUrl,
          amount: {
            total: input.amount,
            currency: input.currency ?? 'CNY',
          },
        }

        // JSAPI 需要 payer.openid
        if (input.tradeType === 'jsapi' && input.userId) {
          requestBody.payer = { openid: input.userId }
        }

        if (input.metadata) {
          requestBody.attach = JSON.stringify(input.metadata)
        }

        const path = getOrderPath(input.tradeType)
        const response = await wechatRequest<{ prepay_id?: string, h5_url?: string, code_url?: string }>('POST', path, requestBody)

        // 构建客户端调起参数
        let clientParams: Record<string, unknown> = {}

        if (input.tradeType === 'jsapi') {
          const timestamp = getTimestamp()
          const nonce = generateNonce()
          const paySign = signJsapi(config.appId, timestamp, nonce, response.prepay_id!, config.privateKey)

          clientParams = {
            appId: config.appId,
            timeStamp: timestamp,
            nonceStr: nonce,
            package: `prepay_id=${response.prepay_id}`,
            signType: 'RSA',
            paySign,
          }
        }
        else if (input.tradeType === 'h5') {
          clientParams = { h5Url: response.h5_url }
        }
        else if (input.tradeType === 'native') {
          clientParams = { codeUrl: response.code_url }
        }

        return ok({
          provider: 'wechat',
          tradeType: input.tradeType,
          clientParams,
          prepayId: response.prepay_id,
        })
      }
      catch (cause) {
        return err({
          code: PaymentErrorCode.CREATE_ORDER_FAILED,
          message: paymentM('payment_createOrderFailed'),
          cause,
        })
      }
    },

    async handleNotify(request: PaymentNotifyRequest): Promise<Result<PaymentNotifyResult, PaymentError>> {
      try {
        const timestamp = request.headers['wechatpay-timestamp'] ?? ''
        const nonce = request.headers['wechatpay-nonce'] ?? ''
        const signature = request.headers['wechatpay-signature'] ?? ''

        // 验签
        if (config.platformCert) {
          const valid = verifyNotifySignature(timestamp, nonce, request.body, signature, config.platformCert)
          if (!valid) {
            return err({
              code: PaymentErrorCode.NOTIFY_VERIFY_FAILED,
              message: paymentM('payment_notifyVerifyFailed'),
            })
          }
        }

        // 解密资源
        const body = JSON.parse(request.body) as {
          resource: { ciphertext: string, nonce: string, associated_data: string }
        }
        const decrypted = decryptResource(
          body.resource.ciphertext,
          body.resource.nonce,
          body.resource.associated_data,
          config.apiV3Key,
        )
        const resource = JSON.parse(decrypted) as WechatNotifyResource

        return ok({
          orderNo: resource.out_trade_no,
          transactionId: resource.transaction_id,
          amount: resource.amount.total,
          status: resource.trade_state === 'SUCCESS' ? 'paid' : 'failed',
          paidAt: resource.success_time ? new Date(resource.success_time) : undefined,
          raw: resource as unknown as Record<string, unknown>,
        })
      }
      catch (cause) {
        return err({
          code: PaymentErrorCode.NOTIFY_PARSE_FAILED,
          message: paymentM('payment_notifyParseFailed'),
          cause,
        })
      }
    },

    async queryOrder(orderNo: string): Promise<Result<OrderStatus, PaymentError>> {
      try {
        const path = `/v3/pay/transactions/out-trade-no/${orderNo}?mchid=${config.mchId}`
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
        return err({
          code: PaymentErrorCode.QUERY_ORDER_FAILED,
          message: paymentM('payment_queryOrderFailed'),
          cause,
        })
      }
    },

    async refund(input: RefundInput): Promise<Result<RefundResult, PaymentError>> {
      try {
        const response = await wechatRequest<{
          refund_id: string
          status: string
        }>('POST', '/v3/refund/domestic/refunds', {
          out_trade_no: input.orderNo,
          out_refund_no: input.refundNo,
          amount: {
            refund: input.amount,
            total: input.amount, // 需要外部传入订单总金额（简化处理）
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
        return err({
          code: PaymentErrorCode.REFUND_FAILED,
          message: paymentM('payment_refundFailed'),
          cause,
        })
      }
    },

    async closeOrder(orderNo: string): Promise<Result<void, PaymentError>> {
      try {
        await wechatRequest('POST', `/v3/pay/transactions/out-trade-no/${orderNo}/close`, {
          mchid: config.mchId,
        })
        return ok(undefined)
      }
      catch (cause) {
        return err({
          code: PaymentErrorCode.CLOSE_ORDER_FAILED,
          message: paymentM('payment_closeOrderFailed'),
          cause,
        })
      }
    },
  }
}
