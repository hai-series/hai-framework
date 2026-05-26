import { z } from 'zod'
import { route } from '../common/route.js'
import {
  PaymentCreateOrderInputSchema,
  PaymentCreateOrderOutputSchema,
  PaymentNotifyMessageOutputSchema,
  PaymentQueryOrderInputSchema,
  PaymentQueryOrderOutputSchema,
  PaymentRefundInputSchema,
  PaymentRefundOutputSchema,
  PaymentStripeNotifyOutputSchema,
} from './payment-schemas.js'

// Webhook 通知体由各支付渠道决定（且通常需要原始 raw body 校验签名），
// 因此 contract 层只声明为 unknown，由 procedure 实现负责按渠道解析。
const WebhookBodySchema = z.unknown()

/** Payment 领域 oRPC contract。 */
export const paymentContract = {
  orders: {
    create: route({ method: 'POST', path: '/payment/orders', operationId: 'payment.orders.create', summary: 'Create payment order', tags: ['payment', 'orders'] })
      .input(PaymentCreateOrderInputSchema)
      .output(PaymentCreateOrderOutputSchema),
    get: route({ method: 'GET', path: '/payment/orders/{orderNo}', operationId: 'payment.orders.get', summary: 'Get payment order', tags: ['payment', 'orders'] })
      .input(PaymentQueryOrderInputSchema)
      .output(PaymentQueryOrderOutputSchema),
    refund: route({ method: 'POST', path: '/payment/orders/{orderNo}/refunds', operationId: 'payment.orders.refund', summary: 'Refund payment order', tags: ['payment', 'orders'] })
      .input(PaymentRefundInputSchema)
      .output(PaymentRefundOutputSchema),
  },
  notifications: {
    wechat: route({ method: 'POST', path: '/payment/notifications/wechat', operationId: 'payment.notifications.wechat', summary: 'Handle WeChat payment notification', tags: ['payment', 'notifications'] })
      .input(WebhookBodySchema)
      .output(PaymentNotifyMessageOutputSchema),
    alipay: route({ method: 'POST', path: '/payment/notifications/alipay', operationId: 'payment.notifications.alipay', summary: 'Handle Alipay payment notification', tags: ['payment', 'notifications'] })
      .input(WebhookBodySchema)
      .output(PaymentNotifyMessageOutputSchema),
    stripe: route({ method: 'POST', path: '/payment/notifications/stripe', operationId: 'payment.notifications.stripe', summary: 'Handle Stripe payment notification', tags: ['payment', 'notifications'] })
      .input(WebhookBodySchema)
      .output(PaymentStripeNotifyOutputSchema),
  },
}

export type PaymentContract = typeof paymentContract
