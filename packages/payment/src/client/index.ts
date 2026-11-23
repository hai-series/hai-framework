import { invokePayment } from './payment-client-web.js'

export type { InvokePaymentResult } from './payment-client-types.js'

/**
 * 浏览器支付调用；签名和异常契约保持不变。
 * @example
 * ```ts
 * import { payment } from '@h-ai/payment/client'
 *
 * // 获取浏览器支付调用入口；支付参数来自已成功创建的订单。
 * const invoke = payment.client.invoke
 * void invoke
 * ```
 */
export const payment = {
  client: { invoke: invokePayment },
}
