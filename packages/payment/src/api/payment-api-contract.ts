/**
 * @h-ai/payment/api — 支付 API 契约
 *
 * 定义支付相关的 API 端点契约（EndpointDef），
 * 供服务端 kit.fromContract() 和客户端 api.call() 共享。
 *
 * @module payment-api
 */

import { z } from 'zod'

// ─── Schemas ───

/** 创建订单入参 Schema */
export const CreatePaymentOrderInputSchema = z.object({
  provider: z.enum(['wechat', 'alipay', 'stripe']),
  amount: z.number().int().min(1),
  description: z.string().min(1),
  tradeType: z.enum(['jsapi', 'h5', 'app', 'native', 'mini_program']),
  userId: z.string().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
})

/** 创建订单出参 Schema */
export const CreatePaymentOrderOutputSchema = z.object({
  provider: z.string(),
  tradeType: z.string(),
  clientParams: z.record(z.string(), z.unknown()),
  prepayId: z.string().optional(),
})

/** 查询订单出参 Schema */
export const QueryOrderOutputSchema = z.object({
  orderNo: z.string(),
  transactionId: z.string().optional(),
  status: z.enum(['pending', 'paid', 'closed', 'refunded', 'failed']),
  amount: z.number(),
  paidAt: z.string().optional(),
})

/** 退款入参 Schema */
export const RefundInputSchema = z.object({
  provider: z.string(),
  orderNo: z.string(),
  refundNo: z.string(),
  amount: z.number().int().min(1),
  reason: z.string().optional(),
})

/** 退款出参 Schema */
export const RefundOutputSchema = z.object({
  refundNo: z.string(),
  refundId: z.string(),
  status: z.enum(['processing', 'success', 'failed']),
})

// ─── 推导类型 ───

export type CreatePaymentOrderInput = z.infer<typeof CreatePaymentOrderInputSchema>
export type CreatePaymentOrderOutput = z.infer<typeof CreatePaymentOrderOutputSchema>
export type QueryOrderOutput = z.infer<typeof QueryOrderOutputSchema>
export type RefundInput = z.infer<typeof RefundInputSchema>
export type RefundOutput = z.infer<typeof RefundOutputSchema>

// ─── EndpointDef（内联定义，避免循环依赖） ───

interface EndpointDef<TInput, TOutput> {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  path: string
  input: z.ZodType<TInput>
  output: z.ZodType<TOutput>
  requireAuth?: boolean
  meta?: { summary?: string, tags?: string[] }
}

/**
 * 支付 API 端点契约
 */
export const paymentEndpoints = {
  /** 创建支付订单 */
  createOrder: {
    method: 'POST',
    path: '/payment/create',
    input: CreatePaymentOrderInputSchema,
    output: CreatePaymentOrderOutputSchema,
    requireAuth: true,
    meta: { summary: 'Create payment order', tags: ['payment'] },
  } satisfies EndpointDef<CreatePaymentOrderInput, CreatePaymentOrderOutput>,

  /** 查询订单状态 */
  queryOrder: {
    method: 'GET',
    path: '/payment/query',
    input: z.object({ orderNo: z.string() }),
    output: QueryOrderOutputSchema,
    requireAuth: true,
    meta: { summary: 'Query order status', tags: ['payment'] },
  } satisfies EndpointDef<{ orderNo: string }, QueryOrderOutput>,

  /** 微信支付回调 */
  notifyWechat: {
    method: 'POST',
    path: '/payment/notify/wechat',
    input: z.object({}),
    output: z.object({ code: z.string(), message: z.string() }),
    requireAuth: false,
    meta: { summary: 'Wechat payment notification', tags: ['payment'] },
  } satisfies EndpointDef<Record<string, never>, { code: string, message: string }>,

  /** 支付宝回调 */
  notifyAlipay: {
    method: 'POST',
    path: '/payment/notify/alipay',
    input: z.object({}),
    output: z.object({ code: z.string(), message: z.string() }),
    requireAuth: false,
    meta: { summary: 'Alipay payment notification', tags: ['payment'] },
  } satisfies EndpointDef<Record<string, never>, { code: string, message: string }>,

  /** Stripe Webhook */
  notifyStripe: {
    method: 'POST',
    path: '/payment/notify/stripe',
    input: z.object({}),
    output: z.object({ received: z.boolean() }),
    requireAuth: false,
    meta: { summary: 'Stripe webhook', tags: ['payment'] },
  } satisfies EndpointDef<Record<string, never>, { received: boolean }>,

  /** 发起退款 */
  refund: {
    method: 'POST',
    path: '/payment/refund',
    input: RefundInputSchema,
    output: RefundOutputSchema,
    requireAuth: true,
    meta: { summary: 'Request refund', tags: ['payment'] },
  } satisfies EndpointDef<RefundInput, RefundOutput>,
} as const
