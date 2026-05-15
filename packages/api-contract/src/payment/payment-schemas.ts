import { z } from 'zod'
import { haiResultSchema } from '../common/result-schemas.js'

/** 支付渠道 Schema。 */
export const PaymentProviderSchema = z.enum(['wechat', 'alipay', 'stripe'])

/** 支付交易类型 Schema。 */
export const PaymentTradeTypeSchema = z.enum(['jsapi', 'h5', 'app', 'native', 'mini_program'])

/** 创建支付订单入参 Schema。 */
export const PaymentCreateOrderInputSchema = z.object({
  provider: PaymentProviderSchema,
  amount: z.number().int().min(1),
  description: z.string().min(1),
  tradeType: PaymentTradeTypeSchema,
  userId: z.string().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
})

/** 创建支付订单业务数据 Schema。 */
export const PaymentCreateOrderDataSchema = z.object({
  provider: z.string(),
  tradeType: z.string(),
  clientParams: z.record(z.string(), z.unknown()),
  prepayId: z.string().optional(),
})

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
  paidAt: z.string().optional(),
})

/** 退款入参 Schema。 */
export const PaymentRefundInputSchema = z.object({
  provider: z.string(),
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

export const PaymentCreateOrderOutputSchema = haiResultSchema(PaymentCreateOrderDataSchema)
export const PaymentQueryOrderOutputSchema = haiResultSchema(PaymentOrderSchema)
export const PaymentRefundOutputSchema = haiResultSchema(PaymentRefundDataSchema)
export const PaymentNotifyMessageOutputSchema = haiResultSchema(PaymentNotifyMessageSchema)
export const PaymentStripeNotifyOutputSchema = haiResultSchema(PaymentStripeNotifyDataSchema)

export type PaymentCreateOrderInput = z.infer<typeof PaymentCreateOrderInputSchema>
export type PaymentCreateOrderOutput = z.infer<typeof PaymentCreateOrderOutputSchema>
export type PaymentRefundInput = z.infer<typeof PaymentRefundInputSchema>
