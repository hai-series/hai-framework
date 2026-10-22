/**
 * @h-ai/payment — 错误码 + 配置 Schema
 *
 * 支付模块的错误码、Zod 配置 Schema 与配置类型。
 * @module payment-config
 */

import { z } from 'zod'
import { paymentM } from './payment-i18n.js'

// ─── 配置 Schema ───

/**
 * 微信公众号 JSAPI 配置 Schema；平台密钥按受信 serial 精确配置。
 * @example
 * ```ts
 * import { WechatPayConfigSchema } from '@h-ai/payment'
 * // 部署系统注入可信配置；Schema 校验形状，不证明密钥、证书或渠道账户可用。
 * const platformKeys: unknown = JSON.parse(process.env.HAI_PAYMENT_WECHAT_PLATFORMKEYS ?? '{}')
 * const parsed = WechatPayConfigSchema.safeParse({
 *   mchId: process.env.HAI_PAYMENT_WECHAT_MCHID,
 *   apiV3Key: process.env.HAI_PAYMENT_WECHAT_APIV3KEY,
 *   serialNo: process.env.HAI_PAYMENT_WECHAT_SERIALNO,
 *   privateKey: process.env.HAI_PAYMENT_WECHAT_PRIVATEKEY,
 *   platformKeys,
 *   appId: process.env.HAI_PAYMENT_WECHAT_APPID,
 * })
 * if (!parsed.success) throw new Error('Payment configuration is invalid')
 * const config = parsed.data
 * ```
 */
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

/**
 * 支付宝手机网站支付配置 Schema；returnUrl 为可信 HTTPS 导航地址。
 * @example
 * ```ts
 * import { AlipayConfigSchema } from '@h-ai/payment'
 * // 部署系统注入可信配置；Schema 校验形状，不证明密钥、证书或渠道账户可用。
 * const parsed = AlipayConfigSchema.safeParse({
 *   appId: process.env.HAI_PAYMENT_ALIPAY_APPID,
 *   sellerId: process.env.HAI_PAYMENT_ALIPAY_SELLERID,
 *   privateKey: process.env.HAI_PAYMENT_ALIPAY_PRIVATEKEY,
 *   alipayPublicKey: process.env.HAI_PAYMENT_ALIPAY_ALIPAYPUBLICKEY,
 *   returnUrl: 'https://shop.example.com/payment/result',
 * })
 * if (!parsed.success) throw new Error('Payment configuration is invalid')
 * const config = parsed.data
 * ```
 */
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

/**
 * Stripe 托管 Checkout 配置 Schema；初始化前要求共享 reldb 就绪。
 * @example
 * ```ts
 * import { StripeConfigSchema } from '@h-ai/payment'
 * // 部署系统注入可信配置；Schema 校验形状，不证明密钥、证书或渠道账户可用。
 * const parsed = StripeConfigSchema.safeParse({
 *   secretKey: process.env.HAI_PAYMENT_STRIPE_SECRETKEY,
 *   webhookSecret: process.env.HAI_PAYMENT_STRIPE_WEBHOOKSECRET,
 *   successUrl: 'https://shop.example.com/payment/result?session={CHECKOUT_SESSION_ID}',
 * })
 * if (!parsed.success) throw new Error('Payment configuration is invalid')
 * const config = parsed.data
 * ```
 */
export const StripeConfigSchema = z.object({
  secretKey: z.string().regex(/^(?:sk|rk)_(?:test|live)_\S+$/, paymentM('payment_stripeKeyInvalid')),
  webhookSecret: z.string().min(1, paymentM('payment_configFieldRequired')),
  /** 托管 Checkout 完成后的可信跳转地址，可含 {CHECKOUT_SESSION_ID}。 */
  successUrl: z.url({ protocol: /^https?$/ }),
  /** 托管 Checkout 取消按钮的可信跳转地址；省略时不显示返回按钮。 */
  cancelUrl: z.url({ protocol: /^https?$/ }).optional(),
  webhookToleranceSeconds: z.number().int().positive().default(300),
}).strict()

/**
 * 支付模块配置 Schema；按配置注册渠道，密钥与运行时依赖由宿主提供。
 * @example
 * ```ts
 * import { PaymentConfigSchema } from '@h-ai/payment'
 * const parsed = PaymentConfigSchema.safeParse({ stripe: {
 *   secretKey: process.env.HAI_PAYMENT_STRIPE_SECRETKEY,
 *   webhookSecret: process.env.HAI_PAYMENT_STRIPE_WEBHOOKSECRET,
 *   successUrl: 'https://shop.example.com/payment/result?session={CHECKOUT_SESSION_ID}',
 * } })
 * if (!parsed.success) throw new Error('Payment configuration is invalid')
 * const toleranceSeconds = parsed.data.stripe?.webhookToleranceSeconds
 * ```
 */
export const PaymentConfigSchema = z.object({
  wechat: WechatPayConfigSchema.optional(),
  alipay: AlipayConfigSchema.optional(),
  stripe: StripeConfigSchema.optional(),
})

/**
 * PaymentConfigSchema 解析后的配置类型；不能把未解析输入当作该类型。
 * @example
 * ```ts
 * import { PaymentConfigSchema, type PaymentConfig } from '@h-ai/payment'
 * const parsed = PaymentConfigSchema.safeParse({ stripe: {
 *   secretKey: process.env.HAI_PAYMENT_STRIPE_SECRETKEY,
 *   webhookSecret: process.env.HAI_PAYMENT_STRIPE_WEBHOOKSECRET,
 *   successUrl: 'https://shop.example.com/payment/result?session={CHECKOUT_SESSION_ID}',
 * } })
 * if (!parsed.success) throw new Error('Payment configuration is invalid')
 * const config: PaymentConfig = parsed.data
 * config.stripe?.webhookToleranceSeconds // 解析输出包含默认的签名容差。
 * ```
 */
export type PaymentConfig = z.infer<typeof PaymentConfigSchema>
/**
 * 支付初始化输入；允许省略由 Schema 补齐的配置默认值。
 * @example
 * ```ts
 * import { payment, type PaymentConfigInput } from '@h-ai/payment'
 * async function initializePayment(input: PaymentConfigInput) {
 *   // 启用 Stripe 时，宿主已经先初始化共享 reldb 并检查成功。
 *   const result = await payment.init(input)
 *   if (!result.success) throw new Error(result.error.message)
 * }
 * ```
 */
export type PaymentConfigInput = z.input<typeof PaymentConfigSchema>
/**
 * 微信配置的解析输出类型；默认值已经由对应 Schema 补齐。
 * @example
 * ```ts
 * import { WechatPayConfigSchema, type WechatPayConfig } from '@h-ai/payment'
 * const platformKeys: unknown = JSON.parse(process.env.HAI_PAYMENT_WECHAT_PLATFORMKEYS ?? '{}')
 * const parsed = WechatPayConfigSchema.safeParse({
 *   mchId: process.env.HAI_PAYMENT_WECHAT_MCHID,
 *   apiV3Key: process.env.HAI_PAYMENT_WECHAT_APIV3KEY,
 *   serialNo: process.env.HAI_PAYMENT_WECHAT_SERIALNO,
 *   privateKey: process.env.HAI_PAYMENT_WECHAT_PRIVATEKEY,
 *   platformKeys,
 *   appId: process.env.HAI_PAYMENT_WECHAT_APPID,
 * })
 * if (!parsed.success) throw new Error('Payment configuration is invalid')
 * const config: WechatPayConfig = parsed.data
 * ```
 */
export type WechatPayConfig = z.infer<typeof WechatPayConfigSchema>
/**
 * 支付宝配置的解析输出类型；默认值已经由对应 Schema 补齐。
 * @example
 * ```ts
 * import { AlipayConfigSchema, type AlipayConfig } from '@h-ai/payment'
 * const parsed = AlipayConfigSchema.safeParse({
 *   appId: process.env.HAI_PAYMENT_ALIPAY_APPID,
 *   sellerId: process.env.HAI_PAYMENT_ALIPAY_SELLERID,
 *   privateKey: process.env.HAI_PAYMENT_ALIPAY_PRIVATEKEY,
 *   alipayPublicKey: process.env.HAI_PAYMENT_ALIPAY_ALIPAYPUBLICKEY,
 *   returnUrl: 'https://shop.example.com/payment/result',
 * })
 * if (!parsed.success) throw new Error('Payment configuration is invalid')
 * const config: AlipayConfig = parsed.data
 * ```
 */
export type AlipayConfig = z.infer<typeof AlipayConfigSchema>
/**
 * Stripe配置的解析输出类型；默认值已经由对应 Schema 补齐。
 * @example
 * ```ts
 * import { StripeConfigSchema, type StripeConfig } from '@h-ai/payment'
 * const parsed = StripeConfigSchema.safeParse({
 *   secretKey: process.env.HAI_PAYMENT_STRIPE_SECRETKEY,
 *   webhookSecret: process.env.HAI_PAYMENT_STRIPE_WEBHOOKSECRET,
 *   successUrl: 'https://shop.example.com/payment/result?session={CHECKOUT_SESSION_ID}',
 * })
 * if (!parsed.success) throw new Error('Payment configuration is invalid')
 * const config: StripeConfig = parsed.data
 * ```
 */
export type StripeConfig = z.infer<typeof StripeConfigSchema>
