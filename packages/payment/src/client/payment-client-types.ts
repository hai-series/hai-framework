/**
 * @h-ai/payment/client — 客户端类型
 *
 * 客户端支付调起相关类型。
 * @module payment-client-types
 */

/** 支付调起结果 */
export interface InvokePaymentResult {
  /** 是否成功调起 */
  invoked: boolean
  /** 额外信息 */
  message?: string
}
