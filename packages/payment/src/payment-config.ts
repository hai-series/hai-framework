/**
 * @h-ai/payment — 错误码 + 配置 Schema
 *
 * 支付模块的错误码、Zod 配置 Schema 与配置类型。
 * @module payment-config
 */

import { z } from 'zod'
import { paymentM } from './payment-i18n.js'

// ─── 错误码 ───

export const PaymentErrorCode = {
  CREATE_ORDER_FAILED: 7000,
  QUERY_ORDER_FAILED: 7001,
  REFUND_FAILED: 7002,
  CLOSE_ORDER_FAILED: 7003,
  NOT_INITIALIZED: 7010,
  SIGN_FAILED: 7020,
  PROVIDER_NOT_FOUND: 7030,
  INVALID_AMOUNT: 7040,
  NOTIFY_VERIFY_FAILED: 7050,
  NOTIFY_PARSE_FAILED: 7051,
  INVOKE_WEB_FAILED: 7060,
  INVOKE_APP_FAILED: 7061,
  CONFIG_ERROR: 7070,
} as const

export type PaymentErrorCodeType = (typeof PaymentErrorCode)[keyof typeof PaymentErrorCode]

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
