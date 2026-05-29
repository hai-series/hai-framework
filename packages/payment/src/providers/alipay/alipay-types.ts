/**
 * @h-ai/payment — 支付宝类型
 *
 * 支付宝 Open API 的内部请求/响应类型。
 * @module alipay-types
 */

import { z } from 'zod'

/** 支付宝回调参数 */
export const AlipayNotifyParamsSchema = z.object({
  out_trade_no: z.string().min(1),
  trade_no: z.string().min(1),
  trade_status: z.string().min(1),
  total_amount: z.string().min(1),
  gmt_payment: z.string().optional(),
}).catchall(z.string())

export type AlipayNotifyParams = z.infer<typeof AlipayNotifyParamsSchema>
