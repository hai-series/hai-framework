import { ORPCError } from '@orpc/contract'
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
const alipayNotifyOperation = {
  operationId: 'payment.notifications.alipay',
  summary: 'Handle Alipay payment notification',
  tags: ['payment', 'notifications'],
}

// oRPC 的普通字符串响应会序列化为带引号的 JSON，支付宝要求原样返回 success。
const alipayNotifyOutputSchema = haiResultSchema(z.literal('success')).transform((result) => {
  if (!result.success) {
    const status = result.error.httpStatus ?? 500
    throw new ORPCError(status >= 400 && status < 500
      ? 'BAD_REQUEST'
      : 'INTERNAL_SERVER_ERROR')
  }
  return {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
    body: new Blob([result.data]).stream(),
  }
})

/**
 * Payment 领域 oRPC contract。支付宝通知使用纯文本回执，应用在原始 HTTP 路由中读取表单并验签。
 * @example
 * ```ts
 * import { apiContract } from '@h-ai/api-contract'
 *
 * const contract = apiContract.payment
 * void contract
 * ```
 */
export const paymentContract = {
  orders: {
    create: route({
      method: 'POST',
      path: '/payment/orders',
      operationId: 'payment.orders.create',
      summary: 'Create payment order',
      tags: ['payment', 'orders'],
    })
      .input(PaymentCreateOrderInputSchema)
      .output(haiResultSchema(PaymentCreateOrderDataSchema)),
    get: route({
      method: 'GET',
      path: '/payment/orders/{orderNo}',
      operationId: 'payment.orders.get',
      summary: 'Get payment order',
      tags: ['payment', 'orders'],
    })
      .input(PaymentQueryOrderInputSchema)
      .output(haiResultSchema(PaymentOrderSchema)),
    refund: route({
      method: 'POST',
      path: '/payment/orders/{orderNo}/refunds',
      operationId: 'payment.orders.refund',
      summary: 'Refund payment order',
      tags: ['payment', 'orders'],
    })
      .input(PaymentRefundInputSchema)
      .output(haiResultSchema(PaymentRefundDataSchema)),
  },
  notifications: {
    wechat: route({
      method: 'POST',
      path: '/payment/notifications/wechat',
      operationId: 'payment.notifications.wechat',
      summary: 'Handle WeChat payment notification',
      tags: ['payment', 'notifications'],
    })
      .input(WebhookBodySchema)
      .output(haiResultSchema(PaymentNotifyMessageSchema)),
    alipay: route({
      method: 'POST',
      path: '/payment/notifications/alipay',
      ...alipayNotifyOperation,
      outputStructure: 'detailed',
      // 应用挂载原始 HTTP 路由读取验签所需正文，避免 oRPC 的表单解码。
      spec: {
        ...alipayNotifyOperation,
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/x-www-form-urlencoded': {
              schema: {
                type: 'object',
                additionalProperties: { type: 'string' },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Payment notification acknowledged',
            content: {
              'text/plain': {
                schema: { type: 'string', const: 'success' },
              },
            },
          },
          400: { description: 'Invalid payment notification' },
          500: { description: 'Payment notification processing failed' },
        },
      },
    })
      .input(WebhookBodySchema)
      .output(alipayNotifyOutputSchema),
    stripe: route({
      method: 'POST',
      path: '/payment/notifications/stripe',
      operationId: 'payment.notifications.stripe',
      summary: 'Handle Stripe payment notification',
      tags: ['payment', 'notifications'],
    })
      .input(WebhookBodySchema)
      .output(haiResultSchema(PaymentStripeNotifyDataSchema)),
  },
}

/**
 * payment 领域公开 procedure 契约的完整类型。
 * @example
 * ```ts
 *
 * import { type PaymentContract, apiContract } from '@h-ai/api-contract'
 *
 * const contract: PaymentContract = apiContract.payment
 * void contract
 * ```
 */
export type PaymentContract = typeof paymentContract
