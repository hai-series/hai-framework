import { oc } from '@orpc/contract'
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

/** Payment 领域 oRPC contract。 */
export const paymentContract = {
  orders: {
    create: oc
      .route({ method: 'POST', path: '/payment/orders', operationId: 'payment.orders.create', summary: 'Create payment order', tags: ['payment', 'orders'] })
      .input(PaymentCreateOrderInputSchema)
      .output(PaymentCreateOrderOutputSchema),
    get: oc
      .route({ method: 'GET', path: '/payment/orders/{orderNo}', operationId: 'payment.orders.get', summary: 'Get payment order', tags: ['payment', 'orders'] })
      .input(PaymentQueryOrderInputSchema)
      .output(PaymentQueryOrderOutputSchema),
    refund: oc
      .route({ method: 'POST', path: '/payment/orders/{orderNo}/refunds', operationId: 'payment.orders.refund', summary: 'Refund payment order', tags: ['payment', 'orders'] })
      .input(PaymentRefundInputSchema)
      .output(PaymentRefundOutputSchema),
  },
  notifications: {
    wechat: oc
      .route({ method: 'POST', path: '/payment/notifications/wechat', operationId: 'payment.notifications.wechat', summary: 'Handle WeChat payment notification', tags: ['payment', 'notifications'] })
      .output(PaymentNotifyMessageOutputSchema),
    alipay: oc
      .route({ method: 'POST', path: '/payment/notifications/alipay', operationId: 'payment.notifications.alipay', summary: 'Handle Alipay payment notification', tags: ['payment', 'notifications'] })
      .output(PaymentNotifyMessageOutputSchema),
    stripe: oc
      .route({ method: 'POST', path: '/payment/notifications/stripe', operationId: 'payment.notifications.stripe', summary: 'Handle Stripe payment notification', tags: ['payment', 'notifications'] })
      .output(PaymentStripeNotifyOutputSchema),
  },
}

export type PaymentContract = typeof paymentContract
