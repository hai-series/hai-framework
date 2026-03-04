/**
 * @h-ai/payment/client — 客户端类型
 *
 * 客户端支付调起相关类型。
 * @module payment-client-types
 */

import type { PaymentOrder } from '../payment-types.js'

/** 支付调起结果 */
export interface InvokePaymentResult {
  /** 是否成功调起 */
  invoked: boolean
  /** 额外信息 */
  message?: string
}

/** 支付调起选项 */
export interface InvokePaymentOptions {
  /** 支付订单（来自后端 createOrder 返回） */
  order: PaymentOrder
  /** 成功回调 URL（Web 跳转场景） */
  successUrl?: string
  /** 取消回调 URL */
  cancelUrl?: string
}
