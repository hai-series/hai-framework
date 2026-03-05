/**
 * @h-ai/payment — Stripe Provider
 *
 * 实现 PaymentProvider 接口，对接 Stripe API。
 * 使用 Stripe Checkout Session 模式。
 * @module stripe-provider
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
  StripeConfig,
} from '../../payment-types.js'
import { createHmac } from 'node:crypto'
import { core, err, ok } from '@h-ai/core'
import { paymentM } from '../../payment-i18n.js'
import { PaymentErrorCode } from '../../payment-types.js'

/** Stripe API 基地址 */
const STRIPE_API_BASE = 'https://api.stripe.com/v1'

/**
 * 创建 Stripe Provider
 *
 * @param config - Stripe 配置
 * @returns PaymentProvider 实例
 */
export function createStripeProvider(config: StripeConfig): PaymentProvider {
  /** Stripe API 请求 */
  async function stripeRequest<T>(method: string, path: string, body?: Record<string, string>): Promise<T> {
    const response = await fetch(`${STRIPE_API_BASE}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${config.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body
        ? Object.entries(body).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
        : undefined,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Stripe API ${method} ${path} failed: ${response.status} ${errorText}`)
    }

    return response.json() as T
  }

  /** 验证 Stripe Webhook 签名 */
  function verifyWebhookSignature(payload: string, signature: string): boolean {
    const parts = signature.split(',')
    const timestamp = parts.find(p => p.startsWith('t='))?.slice(2) ?? ''
    const v1 = parts.find(p => p.startsWith('v1='))?.slice(3) ?? ''

    const signedPayload = `${timestamp}.${payload}`
    const expected = createHmac('sha256', config.webhookSecret)
      .update(signedPayload)
      .digest('hex')

    try {
      return core.string.constantTimeEqual(v1, expected)
    }
    catch {
      return false
    }
  }

  return {
    name: 'stripe',

    async createOrder(input: CreateOrderInput): Promise<Result<PaymentOrder, PaymentError>> {
      try {
        // 使用 Stripe Checkout Session
        const params: Record<string, string> = {
          'mode': 'payment',
          'line_items[0][price_data][currency]': input.currency?.toLowerCase() ?? 'usd',
          'line_items[0][price_data][product_data][name]': input.description,
          'line_items[0][price_data][unit_amount]': input.amount.toString(),
          'line_items[0][quantity]': '1',
        }

        // metadata 传递订单号
        params['metadata[orderNo]'] = input.orderNo
        if (input.metadata) {
          for (const [k, v] of Object.entries(input.metadata)) {
            params[`metadata[${k}]`] = v
          }
        }

        const session = await stripeRequest<{
          id: string
          url: string
          payment_intent: string
        }>('POST', '/checkout/sessions', params)

        return ok({
          provider: 'stripe',
          tradeType: input.tradeType,
          clientParams: {
            sessionId: session.id,
            checkoutUrl: session.url,
          },
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
        const signature = request.headers['stripe-signature'] ?? ''

        // 验签
        const valid = verifyWebhookSignature(request.body, signature)
        if (!valid) {
          return err({
            code: PaymentErrorCode.NOTIFY_VERIFY_FAILED,
            message: paymentM('payment_notifyVerifyFailed'),
          })
        }

        const event = JSON.parse(request.body) as {
          type: string
          data: {
            object: {
              id: string
              metadata?: Record<string, string>
              amount_total?: number
              payment_status?: string
            }
          }
        }

        const obj = event.data.object
        const orderNo = obj.metadata?.orderNo ?? ''

        const statusMap: Record<string, PaymentNotifyResult['status']> = {
          'checkout.session.completed': 'paid',
          'payment_intent.payment_failed': 'failed',
        }

        return ok({
          orderNo,
          transactionId: obj.id,
          amount: obj.amount_total ?? 0,
          status: statusMap[event.type] ?? 'pending',
          paidAt: new Date(),
          raw: event as unknown as Record<string, unknown>,
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
        // 搜索 checkout sessions by metadata
        const sessions = await stripeRequest<{
          data: Array<{
            id: string
            payment_status: string
            amount_total: number
          }>
        }>('GET', `/checkout/sessions?limit=1&metadata[orderNo]=${orderNo}`)

        const session = sessions.data[0]
        if (!session) {
          return ok({
            orderNo,
            status: 'pending',
            amount: 0,
          })
        }

        const statusMap: Record<string, OrderStatus['status']> = {
          paid: 'paid',
          unpaid: 'pending',
          no_payment_required: 'paid',
        }

        return ok({
          orderNo,
          transactionId: session.id,
          status: statusMap[session.payment_status] ?? 'pending',
          amount: session.amount_total,
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
        // Stripe 退款需要 payment_intent ID，这里简化为根据 orderNo 查询
        const sessions = await stripeRequest<{
          data: Array<{ payment_intent: string }>
        }>('GET', `/checkout/sessions?limit=1&metadata[orderNo]=${input.orderNo}`)

        const paymentIntent = sessions.data[0]?.payment_intent
        if (!paymentIntent) {
          return err({
            code: PaymentErrorCode.REFUND_FAILED,
            message: paymentM('payment_refundFailed'),
          })
        }

        const refund = await stripeRequest<{
          id: string
          status: string
        }>('POST', '/refunds', {
          payment_intent: paymentIntent,
          amount: input.amount.toString(),
          reason: input.reason ?? 'requested_by_customer',
        })

        return ok({
          refundNo: input.refundNo,
          refundId: refund.id,
          status: refund.status === 'succeeded' ? 'success' : 'processing',
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

    async closeOrder(_orderNo: string): Promise<Result<void, PaymentError>> {
      // Stripe Checkout Sessions 会自动过期，无需主动关闭
      return ok(undefined)
    },
  }
}
