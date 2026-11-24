/**
 * @h-ai/payment — 微信支付类型
 *
 * 微信支付 API v3 的内部请求/响应类型。
 * @module payment-wechat-types
 */

import { z } from 'zod'

/**
 * 微信支付成功通知；事件创建时间不作为重试时的签名有效时间。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const parsed = WechatNotifyEnvelopeSchema.safeParse({
 *   id: 'event-1', create_time: '2026-10-22T00:00:00Z', event_type: 'TRANSACTION.SUCCESS',
 *   resource_type: 'encrypt-resource', resource: {
 *     algorithm: 'AEAD_AES_256_GCM', original_type: 'transaction', ciphertext: 'encrypted-channel-resource', nonce: 'channel-nonce',
 *   },
 * })
 * if (!parsed.success) throw new Error('Invalid Wechat notification')
 * // 结构成功不能替代真实验签/GCM认证；示例占位密文不具有支付证明效力。
 * ```
 */
export const WechatNotifyEnvelopeSchema = z.object({
  id: z.string().min(1),
  create_time: z.iso.datetime({ offset: true }),
  event_type: z.literal('TRANSACTION.SUCCESS'),
  resource_type: z.literal('encrypt-resource'),
  resource: z.object({
    algorithm: z.literal('AEAD_AES_256_GCM'),
    original_type: z.literal('transaction'),
    ciphertext: z.string().min(1),
    nonce: z.string().min(1),
    associated_data: z.string().optional(),
  }),
})

/**
 * 微信通知解密后必须具备的商户、订单和金额信息。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const parsed = WechatNotifyResourceSchema.safeParse({
 *   appid: 'app-1', mchid: 'merchant-1', out_trade_no: 'ORDER_1', transaction_id: 'WX_1', trade_state: 'SUCCESS',
 *   amount: { total: 100, currency: 'CNY' }, success_time: '2026-10-22T00:00:00Z',
 * })
 * if (!parsed.success) throw new Error('Invalid Wechat resource')
 * const amountInCents = parsed.data.amount.total // 解密后仍须核对可信商户、业务订单及币种。
 * ```
 */
export const WechatNotifyResourceSchema = z.object({
  appid: z.string().min(1),
  mchid: z.string().min(1),
  out_trade_no: z.string().min(1),
  transaction_id: z.string().min(1),
  trade_state: z.literal('SUCCESS'),
  amount: z.object({
    total: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    currency: z.string().regex(/^[A-Z]{3}$/),
  }).passthrough(),
  success_time: z.iso.datetime({ offset: true }),
}).passthrough()

/**
 * 微信商户单号查单应答。渠道可能省略未完成订单的金额和交易号。
 *
 * @example 模块内部上下文
 * ```ts
 * const order = WechatOrderQueryResponseSchema.parse({
 *   appid: 'app-1', mchid: 'merchant-1', out_trade_no: 'ORDER_1', trade_state: 'NOTPAY',
 * })
 * const amount = order.amount?.total
 * ```
 */
export const WechatOrderQueryResponseSchema = z.object({
  appid: z.string().min(1),
  mchid: z.string().min(1),
  out_trade_no: z.string().min(1),
  trade_state: z.enum([
    'SUCCESS',
    'REFUND',
    'NOTPAY',
    'CLOSED',
    'REVOKED',
    'USERPAYING',
    'PAYERROR',
  ]),
  transaction_id: z.string().trim().optional(),
  amount: z.object({
    total: z.number().int().positive().optional(),
    currency: z.literal('CNY').optional(),
  }).optional(),
  success_time: z.iso.datetime({ offset: true }).or(z.literal('')).optional(),
}).refine(order => order.trade_state !== 'SUCCESS' || (!!order.transaction_id && order.amount?.total !== undefined))

/**
 * 微信退款申请应答。核对原订单、退款号和金额后才能采用渠道状态。
 *
 * @example 模块内部上下文
 * ```ts
 * const refund = WechatRefundResponseSchema.parse({
 *   out_trade_no: 'ORDER_1', out_refund_no: 'REFUND_1', refund_id: 'WX_REFUND_1',
 *   status: 'PROCESSING', amount: { total: 100, refund: 50 },
 * })
 * const amountInCents = refund.amount.refund
 * ```
 */
export const WechatRefundResponseSchema = z.object({
  refund_id: z.string().trim().min(1),
  out_refund_no: z.string().min(1),
  out_trade_no: z.string().min(1),
  status: z.enum([
    'SUCCESS',
    'CLOSED',
    'PROCESSING',
    'ABNORMAL',
  ]),
  amount: z.object({
    total: z.number().int().positive(),
    refund: z.number().int().positive(),
    currency: z.literal('CNY').optional(),
  }),
})

/**
 * 微信 JSAPI 下单请求；本模块仅保留公众号网页的完整调起契约。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const request: WechatOrderRequest = {
 *   appid: 'app-1', mchid: 'merchant-1', description: '测试商品', out_trade_no: 'ORDER_1',
 *   notify_url: 'https://api.example.com/payment/notify/wechat', amount: { total: 100, currency: 'CNY' },
 *   payer: { openid: 'openid-issued-for-app-1' },
 * }
 * // appid/mchid 来自受信配置；openid 必须由该公众号的授权流程获得。
 * ```
 */
export interface WechatOrderRequest {
  appid: string
  mchid: string
  description: string
  out_trade_no: string
  notify_url: string
  amount: {
    total: number
    currency: string
  }
  payer: {
    openid: string
  }
  attach?: string
}
