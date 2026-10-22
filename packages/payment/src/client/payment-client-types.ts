/**
 * @h-ai/payment/client — 客户端类型
 *
 * 客户端支付调起相关类型。
 * @module payment-client-types
 */

/**
 * 支付调起结果
 * @example
 * ```ts
 * import type { InvokePaymentResult } from '@h-ai/payment/client'
 * function needsRetry(result: InvokePaymentResult): boolean {
 *   return !result.invoked // invoked=true 仍不证明付款，可能只是提交页面/桥接请求。
 * }
 * ```
 */
export interface InvokePaymentResult {
  /** 是否已经提交客户端调起；即使用户取消也可能为 true，不能作为付款证明。 */
  invoked: boolean
  /** 额外信息 */
  message?: string
}
