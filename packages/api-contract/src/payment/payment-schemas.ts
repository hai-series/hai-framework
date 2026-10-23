import type { HaiResult } from '@h-ai/core'
import { z } from 'zod'

/**
 * 支付渠道 Schema。
 * @example
 * ```ts
 * import { PaymentProviderSchema } from '@h-ai/api-contract'
 *
 * const value = PaymentProviderSchema.parse('wechat')
 * void value
 * ```
 */
export const PaymentProviderSchema = z.enum(['wechat', 'alipay', 'stripe'])

/**
 * 完整实现的支付类型：微信 jsapi，支付宝/Stripe h5。
 * @example
 * ```ts
 * import { PaymentTradeTypeSchema } from '@h-ai/api-contract'
 *
 * const value = PaymentTradeTypeSchema.parse('jsapi')
 * void value
 * ```
 */
export const PaymentTradeTypeSchema = z.enum(['jsapi', 'h5'])

/**
 * 创建支付订单入参 Schema。
 * @example
 * ```ts
 * import { PaymentCreateOrderInputSchema } from '@h-ai/api-contract'
 *
 * const value = PaymentCreateOrderInputSchema.parse({
 *   provider: 'wechat',
 *   amount: 100,
 *   description: 'Example order',
 *   tradeType: 'jsapi',
 *   userId: 'example-openid'
 * })
 * void value
 * ```
 */
export const PaymentCreateOrderInputSchema = z.object({
  provider: PaymentProviderSchema,
  amount: z.number().int().min(1),
  description: z.string().min(1),
  tradeType: PaymentTradeTypeSchema,
  userId: z.string().trim().min(1).max(128).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
}).strict().refine(input => input.tradeType === (input.provider === 'wechat' ? 'jsapi' : 'h5'), { path: ['tradeType'] }).refine(input => input.provider !== 'wechat' || input.userId !== undefined, { path: ['userId'] })

/**
 * 创建支付订单业务数据 Schema。
 * @example
 * ```ts
 * import { PaymentCreateOrderDataSchema } from '@h-ai/api-contract'
 *
 * const value = PaymentCreateOrderDataSchema.parse({
 *   provider: 'wechat',
 *   tradeType: 'jsapi',
 *   prepayId: 'example-prepay',
 *   clientParams: {
 *     appId: 'wx-example',
 *     timeStamp: '1767225600',
 *     nonceStr: 'example-nonce',
 *     package: 'prepay_id=example-prepay',
 *     signType: 'RSA',
 *     paySign: 'example-only-signature'
 *   }
 * })
 * void value
 * ```
 */
export const PaymentCreateOrderDataSchema = z.object({
  provider: PaymentProviderSchema,
  tradeType: PaymentTradeTypeSchema,
  clientParams: z.record(z.string(), z.unknown()),
  prepayId: z.string().optional(),
}).refine(order => order.tradeType === (order.provider === 'wechat' ? 'jsapi' : 'h5'), { path: ['tradeType'] })

/**
 * 查询支付订单入参 Schema。
 * @example
 * ```ts
 * import { PaymentQueryOrderInputSchema } from '@h-ai/api-contract'
 *
 * const value = PaymentQueryOrderInputSchema.parse({
 *   orderNo: 'order_1'
 * })
 * void value
 * ```
 */
export const PaymentQueryOrderInputSchema = z.object({
  orderNo: z.string().min(1),
})

/**
 * 支付订单业务数据 Schema。
 * @example
 * ```ts
 * import { PaymentOrderSchema } from '@h-ai/api-contract'
 *
 * const value = PaymentOrderSchema.parse({
 *   orderNo: 'order_1',
 *   status: 'pending',
 *   amount: 0
 * })
 * void value
 * ```
 */
export const PaymentOrderSchema = z.object({
  orderNo: z.string(),
  transactionId: z.string().optional(),
  status: z.enum(['pending', 'paid', 'closed', 'refunded', 'failed']),
  amount: z.number(),
  // ISO 8601 时间戳（例如 `2024-01-02T03:04:05.000Z`），由服务端以 `Date#toISOString()` 序列化。
  paidAt: z.iso.datetime().optional(),
})

/**
 * 退款入参 Schema。
 * @example
 * ```ts
 * import { PaymentRefundInputSchema } from '@h-ai/api-contract'
 *
 * const value = PaymentRefundInputSchema.parse({
 *   provider: 'wechat',
 *   orderNo: 'order_1',
 *   refundNo: 'refund_1',
 *   amount: 1
 * })
 * void value
 * ```
 */
export const PaymentRefundInputSchema = z.object({
  provider: PaymentProviderSchema,
  orderNo: z.string(),
  refundNo: z.string(),
  amount: z.number().int().min(1),
  reason: z.string().optional(),
})

/**
 * 退款业务数据 Schema。
 * @example
 * ```ts
 * import { PaymentRefundDataSchema } from '@h-ai/api-contract'
 *
 * const value = PaymentRefundDataSchema.parse({
 *   refundNo: 'refund_1',
 *   refundId: 'example',
 *   status: 'processing'
 * })
 * void value
 * ```
 */
export const PaymentRefundDataSchema = z.object({
  refundNo: z.string(),
  refundId: z.string(),
  status: z.enum(['processing', 'success', 'failed']),
})

/**
 * 微信/支付宝通知响应 Schema。
 * @example
 * ```ts
 * import { PaymentNotifyMessageSchema } from '@h-ai/api-contract'
 *
 * const value = PaymentNotifyMessageSchema.parse({
 *   code: 'example-1',
 *   message: 'example'
 * })
 * void value
 * ```
 */
export const PaymentNotifyMessageSchema = z.object({
  code: z.string(),
  message: z.string(),
})

/**
 * Stripe 通知响应 Schema。
 * @example
 * ```ts
 * import { PaymentStripeNotifyDataSchema } from '@h-ai/api-contract'
 *
 * const value = PaymentStripeNotifyDataSchema.parse({
 *   received: true
 * })
 * void value
 * ```
 */
export const PaymentStripeNotifyDataSchema = z.object({
  received: z.boolean(),
})

/**
 * 按渠道和已实现支付方式创建订单的请求。
 * @example
 * ```ts
 * import type { PaymentCreateOrderInput } from '@h-ai/api-contract'
 * import { PaymentCreateOrderInputSchema } from '@h-ai/api-contract'
 *
 * const value: PaymentCreateOrderInput = PaymentCreateOrderInputSchema.parse({
 *   provider: 'wechat',
 *   amount: 100,
 *   description: 'Example order',
 *   tradeType: 'jsapi',
 *   userId: 'example-openid'
 * })
 * void value
 * ```
 */
export type PaymentCreateOrderInput = z.infer<typeof PaymentCreateOrderInputSchema>
/**
 * 以 HaiResult 区分成功业务数据和公共错误的 PaymentCreateOrderOutput 响应。
 * @example
 * ```ts
 * import type { PaymentCreateOrderOutput } from '@h-ai/api-contract'
 * import { PaymentCreateOrderDataSchema } from '@h-ai/api-contract'
 * import { ok } from '@h-ai/core'
 *
 * const response: PaymentCreateOrderOutput = ok(PaymentCreateOrderDataSchema.parse({
 *   provider: 'wechat',
 *   tradeType: 'jsapi',
 *   prepayId: 'example-prepay',
 *   clientParams: {
 *     appId: 'wx-example',
 *     timeStamp: '1767225600',
 *     nonceStr: 'example-nonce',
 *     package: 'prepay_id=example-prepay',
 *     signType: 'RSA',
 *     paySign: 'example-only-signature'
 *   }
 * }))
 * if (response.success) void response.data
 * ```
 */
export type PaymentCreateOrderOutput = HaiResult<z.infer<typeof PaymentCreateOrderDataSchema>>
/**
 * 退款请求，金额单位与支付契约一致。
 * @example
 * ```ts
 * import type { PaymentRefundInput } from '@h-ai/api-contract'
 * import { PaymentRefundInputSchema } from '@h-ai/api-contract'
 *
 * const value: PaymentRefundInput = PaymentRefundInputSchema.parse({
 *   provider: 'wechat',
 *   orderNo: 'order_1',
 *   refundNo: 'refund_1',
 *   amount: 1
 * })
 * void value
 * ```
 */
export type PaymentRefundInput = z.infer<typeof PaymentRefundInputSchema>
