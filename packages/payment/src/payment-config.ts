/**
 * @h-ai/payment — 配置 Schema
 *
 * 支付模块的 Zod 配置 Schema 与默认值。
 * @module payment-config
 */

import { z } from 'zod'

/** 微信支付配置 Schema */
export const WechatPayConfigSchema = z.object({
  mchId: z.string().min(1),
  apiV3Key: z.string().min(1),
  serialNo: z.string().min(1),
  privateKey: z.string().min(1),
  platformCert: z.string().optional(),
  appId: z.string().min(1),
})

/** 支付宝配置 Schema */
export const AlipayConfigSchema = z.object({
  appId: z.string().min(1),
  privateKey: z.string().min(1),
  alipayPublicKey: z.string().min(1),
  signType: z.enum(['RSA2', 'RSA']).default('RSA2'),
  sandbox: z.boolean().default(false),
})

/** Stripe 配置 Schema */
export const StripeConfigSchema = z.object({
  secretKey: z.string().min(1),
  webhookSecret: z.string().min(1),
})

/** 支付模块配置 Schema */
export const PaymentConfigSchema = z.object({
  wechat: WechatPayConfigSchema.optional(),
  alipay: AlipayConfigSchema.optional(),
  stripe: StripeConfigSchema.optional(),
})
