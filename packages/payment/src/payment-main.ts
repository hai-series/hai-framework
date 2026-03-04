/**
 * @h-ai/payment — 模块入口（生命周期管理）
 *
 * 提供支付模块的初始化、Provider 注册与统一支付操作 API。
 * `payment.init(config)` 负责根据配置自动注册可用的 Provider。
 *
 * @module payment-main
 */

import type { Result } from '@h-ai/core'
import type { PaymentConfig, PaymentError } from './payment-types.js'
import { ok } from '@h-ai/core'
import {
  clearProviders,
  closeOrder,
  createOrder,
  getProvider,
  handleNotify,
  queryOrder,
  refund,
  registerProvider,
} from './payment-functions.js'
import { createAlipayProvider } from './providers/alipay/alipay-provider.js'
import { createStripeProvider } from './providers/stripe/stripe-provider.js'
import { createWechatPayProvider } from './providers/wechat/wechat-pay-provider.js'

/**
 * 支付模块服务对象
 *
 * @example
 * ```ts
 * import { payment } from '@h-ai/payment'
 *
 * await payment.init({
 *   wechat: { mchId: '...', apiV3Key: '...', ... },
 *   alipay: { appId: '...', privateKey: '...' , ... },
 * })
 *
 * const result = await payment.createOrder('wechat', {
 *   orderNo: 'ORD001',
 *   amount: 100,
 *   description: '测试商品',
 *   tradeType: 'jsapi',
 *   userId: 'openid-xxx',
 *   notifyUrl: 'https://api.example.com/payment/notify/wechat',
 * })
 * ```
 */
export const payment = {
  /**
   * 初始化支付模块
   *
   * 根据提供的配置自动注册对应的 Provider。
   *
   * @param config - 支付配置
   */
  async init(config: PaymentConfig): Promise<Result<void, PaymentError>> {
    // 清除旧注册
    clearProviders()

    // 按配置自动注册 Provider
    if (config.wechat) {
      registerProvider(createWechatPayProvider(config.wechat))
    }
    if (config.alipay) {
      registerProvider(createAlipayProvider(config.alipay))
    }
    if (config.stripe) {
      registerProvider(createStripeProvider(config.stripe))
    }

    return ok(undefined)
  },

  /**
   * 关闭模块、清除所有 Provider
   */
  async close(): Promise<void> {
    clearProviders()
  },

  /** 创建支付订单 */
  createOrder,

  /** 处理异步回调通知 */
  handleNotify,

  /** 查询订单状态 */
  queryOrder,

  /** 发起退款 */
  refund,

  /** 关闭订单 */
  closeOrder,

  /** 获取已注册的 Provider */
  getProvider,

  /** 手动注册 Provider（自定义渠道） */
  registerProvider,
}
