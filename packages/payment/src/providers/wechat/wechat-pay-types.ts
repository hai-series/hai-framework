/**
 * @h-ai/payment — 微信支付类型
 *
 * 微信支付 API v3 的内部请求/响应类型。
 * @module wechat-pay-types
 */

import { z } from 'zod'

/**
 * 微信支付成功通知；事件创建时间不作为重试时的签名有效时间。
 * @example WechatNotifyEnvelopeSchema.parse(JSON.parse(request.body))
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
 * @example WechatNotifyResourceSchema.parse(JSON.parse(decrypted))
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

/** 微信统一下单请求（JSAPI / H5 / App / Native） */
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
  payer?: {
    openid: string
  }
  scene_info?: {
    payer_client_ip: string
    h5_info?: {
      type: string
    }
  }
  attach?: string
}
