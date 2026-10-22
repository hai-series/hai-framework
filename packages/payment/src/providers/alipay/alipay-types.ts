/**
 * @h-ai/payment — 支付宝类型
 *
 * 支付宝 Open API 的内部请求/响应类型。
 * @module alipay-types
 */

import { z } from 'zod'

/**
 * 支付宝响应根对象；仅允许 JSON 对象，按请求方法读取对应 envelope。
 * @example AlipayResponseRootSchema.parse({ alipay_trade_close_response: { code: '10000' } })
 */
export const AlipayResponseRootSchema = z.record(z.string(), z.unknown())

/**
 * 支付宝公共响应；错误描述不进入上层错误，避免泄漏原始业务数据。
 * @example AlipayResponseSchema.parse({ code: '40004', sub_code: 'ACQ.TRADE_NOT_EXIST' })
 */
export const AlipayResponseSchema = z.object({
  code: z.string().regex(/^\d{5}$/),
  sub_code: z.string().optional(),
})

/** 支付宝金额字符串，禁止指数、负数和超过两位的小数。 */
const AlipayAmountSchema = z.string().regex(/^\d+(?:\.\d{1,2})?$/)

/**
 * JSON 下单响应字段；预创建必须另行检查 qr_code，其余创建操作检查 trade_no。
 * @example AlipayCreateResponseSchema.parse({ out_trade_no: 'ORDER_1', trade_no: 'ALI_1' })
 */
export const AlipayCreateResponseSchema = z.object({
  out_trade_no: z.string().min(1),
  trade_no: z.string().min(1).optional(),
  qr_code: z.string().min(1).optional(),
})

/**
 * 查单成功字段；未知交易状态和缺失金额均拒绝，不能默认成 pending 或零金额。
 * @example AlipayQueryResponseSchema.parse({ out_trade_no: 'ORDER_1', trade_no: 'ALI_1', trade_status: 'TRADE_SUCCESS', total_amount: '1.00' })
 */
export const AlipayQueryResponseSchema = z.object({
  out_trade_no: z.string().min(1),
  trade_no: z.string().min(1),
  trade_status: z.enum(['WAIT_BUYER_PAY', 'TRADE_CLOSED', 'TRADE_SUCCESS', 'TRADE_FINISHED']),
  total_amount: AlipayAmountSchema,
  send_pay_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    .refine(value => Number.isFinite(Date.parse(`${value.replace(' ', 'T')}+08:00`)))
    .optional(),
})

/**
 * 退款受理成功字段；fund_change 缺失或 N 不能证明退款到账。
 * @example AlipayRefundResponseSchema.parse({ out_trade_no: 'ORDER_1', trade_no: 'ALI_1', refund_fee: '1.00', fund_change: 'Y' })
 */
export const AlipayRefundResponseSchema = z.object({
  out_trade_no: z.string().min(1),
  trade_no: z.string().min(1),
  refund_fee: AlipayAmountSchema,
  fund_change: z.enum(['Y', 'N']).optional(),
})

/**
 * 关单成功必须返回可核对的商户订单号和支付宝交易号。
 * @example AlipayCloseResponseSchema.parse({ out_trade_no: 'ORDER_1', trade_no: 'ALI_1' })
 */
export const AlipayCloseResponseSchema = z.object({
  out_trade_no: z.string().min(1),
  trade_no: z.string().min(1),
})

/** 支付宝回调参数 */
export const AlipayNotifyParamsSchema = z.object({
  out_trade_no: z.string().min(1),
  trade_no: z.string().min(1),
  trade_status: z.string().min(1),
  total_amount: z.string().min(1),
  gmt_payment: z.string().optional(),
}).catchall(z.string())

export type AlipayNotifyParams = z.infer<typeof AlipayNotifyParamsSchema>
