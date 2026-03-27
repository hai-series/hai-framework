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
  platformCert: z.string().optional(),
  appId: z.string().min(1, paymentM('payment_configFieldRequired')),
})

/** 支付宝配置 Schema */
export const AlipayConfigSchema = z.object({
  appId: z.string().min(1, paymentM('payment_configFieldRequired')),
  privateKey: z.string().min(1, paymentM('payment_configFieldRequired')),
  alipayPublicKey: z.string().min(1, paymentM('payment_configFieldRequired')),
  signType: z.enum(['RSA2', 'RSA']).default('RSA2'),
  sandbox: z.boolean().default(false),
})

/** Stripe 配置 Schema */
export const StripeConfigSchema = z.object({
  secretKey: z.string().min(1, paymentM('payment_configFieldRequired')),
  webhookSecret: z.string().min(1, paymentM('payment_configFieldRequired')),
})

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
