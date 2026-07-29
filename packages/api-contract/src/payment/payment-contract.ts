import { z } from 'zod'
import { haiResultSchema } from '../common/result-schemas.js'
import { route } from '../common/route.js'
import {
  PaymentCreateOrderDataSchema,
  PaymentCreateOrderInputSchema,
  PaymentNotifyMessageSchema,
  PaymentOrderSchema,
  PaymentQueryOrderInputSchema,
  PaymentRefundDataSchema,
  PaymentRefundInputSchema,
  PaymentStripeNotifyDataSchema,
} from './payment-schemas.js'

// Webhook 通知体由各支付渠道决定（且通常需要原始 raw body 校验签名），
// 因此 contract 层只声明为 unknown，由 procedure 实现负责按渠道解析。
const WebhookBodySchema = z.unknown()
// 微信与支付宝通知共享同一响应结构，仅在本 contract 内复用。
const notifyMessageOutputSchema = haiResultSchema(PaymentNotifyMessageSchema)

/** Payment 领域 oRPC contract。 */
export const paymentContract = {
  orders: {
    create: route({ method: 'POST', path: '/payment/orders', operationId: 'payment.orders.create', summary: 'Create payment order', tags: ['payment', 'orders'] })
      .input(PaymentCreateOrderInputSchema)
      .output(haiResultSchema(PaymentCreateOrderDataSchema)),
    get: route({ method: 'GET', path: '/payment/orders/{orderNo}', operationId: 'payment.orders.get', summary: 'Get payment order', tags: ['payment', 'orders'] })
      .input(PaymentQueryOrderInputSchema)
      .output(haiResultSchema(PaymentOrderSchema)),
    refund: route({ method: 'POST', path: '/payment/orders/{orderNo}/refunds', operationId: 'payment.orders.refund', summary: 'Refund payment order', tags: ['payment', 'orders'] })
      .input(PaymentRefundInputSchema)
      .output(haiResultSchema(PaymentRefundDataSchema)),
  },
  notifications: {
    wechat: route({ method: 'POST', path: '/payment/notifications/wechat', operationId: 'payment.notifications.wechat', summary: 'Handle WeChat payment notification', tags: ['payment', 'notifications'] })
      .input(WebhookBodySchema)
      .output(notifyMessageOutputSchema),
    alipay: route({ method: 'POST', path: '/payment/notifications/alipay', operationId: 'payment.notifications.alipay', summary: 'Handle Alipay payment notification', tags: ['payment', 'notifications'] })
      .input(WebhookBodySchema)
      .output(notifyMessageOutputSchema),
    stripe: route({ method: 'POST', path: '/payment/notifications/stripe', operationId: 'payment.notifications.stripe', summary: 'Handle Stripe payment notification', tags: ['payment', 'notifications'] })
      .input(WebhookBodySchema)
      .output(haiResultSchema(PaymentStripeNotifyDataSchema)),
  },
}

export type PaymentContract = typeof paymentContract
