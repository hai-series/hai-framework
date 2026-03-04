/**
 * @h-ai/payment — 公共导出
 *
 * @module index
 */

// ─── 配置 ───
export {
  AlipayConfigSchema,
  PaymentConfigSchema,
  StripeConfigSchema,
  WechatPayConfigSchema,
} from './payment-config.js'

// ─── 模块入口 ───
export { payment } from './payment-main.js'

// ─── 类型 ───
export type {
  AlipayConfig,
  CreateOrderInput,
  OrderStatus,
  OrderStatusValue,
  PaymentConfig,
  PaymentError,
  PaymentNotifyRequest,
  PaymentNotifyResult,
  PaymentOrder,
  PaymentProvider,
  RefundInput,
  RefundResult,
  StripeConfig,
  TradeType,
  WechatPayConfig,
} from './payment-types.js'
export { PaymentErrorCode } from './payment-types.js'
// ─── Provider ───
export { createAlipayProvider } from './providers/alipay/alipay-provider.js'

export { createStripeProvider } from './providers/stripe/stripe-provider.js'
export { createWechatPayProvider } from './providers/wechat/wechat-pay-provider.js'
