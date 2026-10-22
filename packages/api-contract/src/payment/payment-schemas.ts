import type { HaiResult } from '@h-ai/core'
import { z } from 'zod'

/** 支付渠道 Schema。 */
export const PaymentProviderSchema = z.enum(['wechat', 'alipay', 'stripe'])

/** 完整实现的支付类型：微信 jsapi，支付宝/Stripe h5。 */
export const PaymentTradeTypeSchema = z.enum(['jsapi', 'h5'])

/** 创建支付订单入参 Schema。 */
export const PaymentCreateOrderInputSchema = z.object({
  provider: PaymentProviderSchema,
  amount: z.number().int().min(1),
  description: z.string().min(1),
  tradeType: PaymentTradeTypeSchema,
  userId: z.string().trim().min(1).max(128).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
}).strict().refine(input => input.tradeType === (input.provider === 'wechat' ? 'jsapi' : 'h5'), { path: ['tradeType'] }).refine(input => input.provider !== 'wechat' || input.userId !== undefined, { path: ['userId'] })

/** 创建支付订单业务数据 Schema。 */
export const PaymentCreateOrderDataSchema = z.object({
  provider: PaymentProviderSchema,
  tradeType: PaymentTradeTypeSchema,
  clientParams: z.record(z.string(), z.unknown()),
  prepayId: z.string().optional(),
}).refine(order => order.tradeType === (order.provider === 'wechat' ? 'jsapi' : 'h5'), { path: ['tradeType'] })

/** 查询支付订单入参 Schema。 */
export const PaymentQueryOrderInputSchema = z.object({
  orderNo: z.string().min(1),
})

/** 支付订单业务数据 Schema。 */
export const PaymentOrderSchema = z.object({
  orderNo: z.string(),
  transactionId: z.string().optional(),
  status: z.enum(['pending', 'paid', 'closed', 'refunded', 'failed']),
  amount: z.number(),
  // ISO 8601 时间戳（例如 `2024-01-02T03:04:05.000Z`），由服务端以 `Date#toISOString()` 序列化。
  paidAt: z.iso.datetime().optional(),
})

/** 退款入参 Schema。 */
export const PaymentRefundInputSchema = z.object({
  provider: PaymentProviderSchema,
  orderNo: z.string(),
  refundNo: z.string(),
  amount: z.number().int().min(1),
  reason: z.string().optional(),
})

/** 退款业务数据 Schema。 */
export const PaymentRefundDataSchema = z.object({
  refundNo: z.string(),
  refundId: z.string(),
  status: z.enum(['processing', 'success', 'failed']),
})

/** 微信/支付宝通知响应 Schema。 */
export const PaymentNotifyMessageSchema = z.object({
  code: z.string(),
  message: z.string(),
})

/** Stripe 通知响应 Schema。 */
export const PaymentStripeNotifyDataSchema = z.object({
  received: z.boolean(),
})

export type PaymentCreateOrderInput = z.infer<typeof PaymentCreateOrderInputSchema>
export type PaymentCreateOrderOutput = HaiResult<z.infer<typeof PaymentCreateOrderDataSchema>>
export type PaymentRefundInput = z.infer<typeof PaymentRefundInputSchema>
