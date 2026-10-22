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
