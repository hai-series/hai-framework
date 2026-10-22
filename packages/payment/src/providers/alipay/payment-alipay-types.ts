/**
 * @h-ai/payment — 支付宝类型
 *
 * 支付宝 Open API 的内部请求/响应类型。
 * @module payment-alipay-types
 */

import { z } from 'zod'
import { parseAlipayTime } from './payment-alipay-time.js'

/** 支付宝北京时间，拒绝非法日历日期。 */
const AlipayTimeSchema = z.string().refine(value => parseAlipayTime(value) !== undefined)

/**
 * 支付宝响应根对象；仅允许 JSON 对象，按请求方法读取对应 envelope。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const parsed = AlipayResponseRootSchema.safeParse({ alipay_trade_close_response: { code: '10000' } })
 * if (!parsed.success) throw new Error('Invalid Alipay response')
 * const response = parsed.data // Schema 只校验结构；业务成功码与请求身份仍由 Provider 核对。
 * ```
 */
export const AlipayResponseRootSchema = z.record(z.string(), z.unknown())

/**
 * 支付宝公共响应；错误描述不进入上层错误，避免泄漏原始业务数据。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const parsed = AlipayResponseSchema.safeParse({ code: '40004', sub_code: 'ACQ.TRADE_NOT_EXIST' })
 * if (!parsed.success) throw new Error('Invalid Alipay response')
 * const response = parsed.data // Schema 只校验结构；业务成功码与请求身份仍由 Provider 核对。
 * ```
 */
export const AlipayResponseSchema = z.object({
  code: z.string().regex(/^\d{5}$/),
  sub_code: z.string().optional(),
})

/** 支付宝金额字符串，禁止指数、负数和超过两位的小数。 */
const AlipayAmountSchema = z.string().regex(/^\d+(?:\.\d{1,2})?$/)

/**
 * 查单成功字段；未知交易状态和缺失金额均拒绝，不能默认成 pending 或零金额。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const parsed = AlipayQueryResponseSchema.safeParse({ out_trade_no: 'ORDER_1', trade_no: 'ALI_1', trade_status: 'TRADE_SUCCESS', total_amount: '1.00', send_pay_date: '2026-10-22 08:00:00' })
 * if (!parsed.success) throw new Error('Invalid Alipay response')
 * const response = parsed.data // Schema 只校验结构；业务成功码与请求身份仍由 Provider 核对。
 * ```
 */
export const AlipayQueryResponseSchema = z.object({
  out_trade_no: z.string().min(1),
  trade_no: z.string().min(1),
  trade_status: z.enum(['WAIT_BUYER_PAY', 'TRADE_CLOSED', 'TRADE_SUCCESS', 'TRADE_FINISHED']),
  total_amount: AlipayAmountSchema,
  send_pay_date: AlipayTimeSchema.optional(),
})

/**
 * 退款受理成功字段；fund_change 缺失或 N 不能证明退款到账。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const parsed = AlipayRefundResponseSchema.safeParse({ out_trade_no: 'ORDER_1', trade_no: 'ALI_1', refund_fee: '1.00', fund_change: 'Y' })
 * if (!parsed.success) throw new Error('Invalid Alipay response')
 * const response = parsed.data // Schema 只校验结构；业务成功码与请求身份仍由 Provider 核对。
 * ```
 */
export const AlipayRefundResponseSchema = z.object({
  out_trade_no: z.string().min(1),
  trade_no: z.string().min(1),
  refund_fee: AlipayAmountSchema,
  fund_change: z.enum(['Y', 'N']).optional(),
})

/**
 * 关单成功必须返回可核对的商户订单号和支付宝交易号。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const parsed = AlipayCloseResponseSchema.safeParse({ out_trade_no: 'ORDER_1', trade_no: 'ALI_1' })
 * if (!parsed.success) throw new Error('Invalid Alipay response')
 * const response = parsed.data // Schema 只校验结构；业务成功码与请求身份仍由 Provider 核对。
 * ```
 */
export const AlipayCloseResponseSchema = z.object({
  out_trade_no: z.string().min(1),
  trade_no: z.string().min(1),
})

/**
 * 支付宝交易通知参数；身份字段、通知 ID 和北京时间不可缺失。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const parsed = AlipayNotifyParamsSchema.safeParse({
 *   app_id: 'app-1', seller_id: 'seller-1', notify_id: 'notify-1',
 *   notify_type: 'trade_status_sync', notify_time: '2026-10-22 08:00:00',
 *   sign_type: 'RSA2', sign: 'signature-from-channel', out_trade_no: 'ORDER_1',
 *   trade_no: 'ALI_1', trade_status: 'TRADE_SUCCESS', total_amount: '1.00',
 *   gmt_payment: '2026-10-22 07:59:00',
 * })
 * if (!parsed.success) throw new Error('Invalid Alipay notification')
 * const value = parsed.data // 结构通过并不代表该占位签名可信；还必须验签并核对 appId/sellerId。
 * ```
 */
export const AlipayNotifyParamsSchema = z.object({
  app_id: z.string().min(1),
  seller_id: z.string().min(1),
  notify_id: z.string().min(1),
  notify_type: z.literal('trade_status_sync'),
  notify_time: AlipayTimeSchema,
  sign_type: z.enum(['RSA', 'RSA2']),
  sign: z.string().min(1),
  out_trade_no: z.string().min(1),
  trade_no: z.string().min(1),
  trade_status: z.enum(['WAIT_BUYER_PAY', 'TRADE_CLOSED', 'TRADE_SUCCESS', 'TRADE_FINISHED']),
  total_amount: AlipayAmountSchema,
  gmt_payment: AlipayTimeSchema.optional(),
}).catchall(z.string()).refine(params => !['TRADE_SUCCESS', 'TRADE_FINISHED'].includes(params.trade_status) || !!params.gmt_payment)

/**
 * 已通过结构校验的支付宝通知；身份与签名由 Provider 继续校验。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const parsed = AlipayNotifyParamsSchema.safeParse({
 *   app_id: 'app-1', seller_id: 'seller-1', notify_id: 'notify-1',
 *   notify_type: 'trade_status_sync', notify_time: '2026-10-22 08:00:00',
 *   sign_type: 'RSA2', sign: 'signature-from-channel', out_trade_no: 'ORDER_1',
 *   trade_no: 'ALI_1', trade_status: 'TRADE_SUCCESS', total_amount: '1.00',
 *   gmt_payment: '2026-10-22 07:59:00',
 * })
 * if (!parsed.success) throw new Error('Invalid Alipay notification')
 * const notification: AlipayNotifyParams = parsed.data
 * const businessOrderNo = notification.out_trade_no
 * ```
 */
export type AlipayNotifyParams = z.infer<typeof AlipayNotifyParamsSchema>
