/**
 * @h-ai/payment — 错误码 + 配置 Schema
 *
 * 支付模块的错误码、Zod 配置 Schema 与配置类型。
 * @module payment-config
 */

import { z } from 'zod'
import { paymentM } from './payment-i18n.js'

// ─── 配置 Schema ───

/** 微信支付配置 Schema */
export const WechatPayConfigSchema = z.object({
  mchId: z.string().min(1, paymentM('payment_configFieldRequired')),
  apiV3Key: z.string().min(1, paymentM('payment_configFieldRequired')),
  serialNo: z.string().min(1, paymentM('payment_configFieldRequired')),
  privateKey: z.string().min(1, paymentM('payment_configFieldRequired')),
  /** 精确按 Wechatpay-Serial 选择平台证书/公钥，轮换期间同时配置新旧标识。 */
  platformKeys: z.record(z.string().min(1), z.string().min(1))
    .refine(keys => Object.keys(keys).length > 0, paymentM('payment_configFieldRequired')),
  appId: z.string().min(1, paymentM('payment_configFieldRequired')),
})

/** 支付宝配置 Schema */
export const AlipayConfigSchema = z.object({
  appId: z.string().min(1, paymentM('payment_configFieldRequired')),
  sellerId: z.string().min(1, paymentM('payment_configFieldRequired')),
  privateKey: z.string().min(1, paymentM('payment_configFieldRequired')),
  alipayPublicKey: z.string().min(1, paymentM('payment_configFieldRequired')),
  /** 手机网站支付完成后返回的可信 HTTPS 地址；仅用于页面导航，不能证明付款。 */
  returnUrl: z.url({ protocol: /^https$/ }),
  signType: z.enum(['RSA2', 'RSA']).default('RSA2'),
  sandbox: z.boolean().default(false),
})

/** Stripe 配置 Schema；启用时必须先初始化共享 reldb，并保留渠道操作记录。 */
export const StripeConfigSchema = z.object({
  secretKey: z.string().regex(/^(?:sk|rk)_(?:test|live)_\S+$/, paymentM('payment_stripeKeyInvalid')),
  webhookSecret: z.string().min(1, paymentM('payment_configFieldRequired')),
  /** 托管 Checkout 完成后的可信跳转地址，可含 {CHECKOUT_SESSION_ID}。 */
  successUrl: z.url({ protocol: /^https?$/ }),
  /** 托管 Checkout 取消按钮的可信跳转地址；省略时不显示返回按钮。 */
  cancelUrl: z.url({ protocol: /^https?$/ }).optional(),
  webhookToleranceSeconds: z.number().int().positive().default(300),
}).strict()

/** 支付模块配置 Schema */
export const PaymentConfigSchema = z.object({
  wechat: WechatPayConfigSchema.optional(),
  alipay: AlipayConfigSchema.optional(),
  stripe: StripeConfigSchema.optional(),
})

export type PaymentConfig = z.infer<typeof PaymentConfigSchema>
export type PaymentConfigInput = z.input<typeof PaymentConfigSchema>
export type WechatPayConfig = z.infer<typeof WechatPayConfigSchema>
export type AlipayConfig = z.infer<typeof AlipayConfigSchema>
export type StripeConfig = z.infer<typeof StripeConfigSchema>
