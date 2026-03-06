/**
 * @h-ai/payment — 模块入口（生命周期管理）
 *
 * 提供支付模块的初始化、Provider 注册与统一支付操作 API。
 * `payment.init(config)` 负责根据配置自动注册可用的 Provider。
 *
 * @module payment-main
 */

import type { Result } from '@h-ai/core'
import type { PaymentConfig, PaymentConfigInput } from './payment-config.js'
import type {
  OrderStatus,
  PaymentError,
  PaymentFunctions,
  PaymentNotifyResult,
  PaymentOrder,
  RefundResult,
} from './payment-types.js'
import { core, err, ok } from '@h-ai/core'
import { PaymentConfigSchema, PaymentErrorCode } from './payment-config.js'
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
import { paymentM } from './payment-i18n.js'
import { createAlipayProvider } from './providers/alipay/alipay-provider.js'
import { createStripeProvider } from './providers/stripe/stripe-provider.js'
import { createWechatPayProvider } from './providers/wechat/wechat-pay-provider.js'

const logger = core.logger.child({ module: 'payment', scope: 'main' })

// ─── 内部状态 ───

let currentConfig: PaymentConfig | null = null

// ─── 未初始化占位 ───

const notInitialized = core.module.createNotInitializedKit<PaymentError>(
  PaymentErrorCode.NOT_INITIALIZED,
  () => paymentM('payment_notInitialized'),
)

// ─── 服务对象 ───

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
export const payment: PaymentFunctions = {
  /**
   * 初始化支付模块
   *
   * 根据提供的配置自动注册对应的 Provider。
   *
   * @param config - 支付配置
   */
  async init(config: PaymentConfigInput): Promise<Result<void, PaymentError>> {
    if (currentConfig !== null) {
      logger.warn('Payment module is already initialized, reinitializing')
      await payment.close()
    }

    logger.info('Initializing payment module')

    const parseResult = PaymentConfigSchema.safeParse(config)
    if (!parseResult.success) {
      logger.error('Payment config validation failed', { error: parseResult.error.message })
      return err({
        code: PaymentErrorCode.CONFIG_ERROR,
        message: paymentM('payment_configError', { params: { error: parseResult.error.message } }),
        cause: parseResult.error,
      })
    }
    const parsed = parseResult.data

    try {
      // 清除旧注册
      clearProviders()

      // 按配置自动注册 Provider
      if (parsed.wechat) {
        registerProvider(createWechatPayProvider(parsed.wechat))
      }
      if (parsed.alipay) {
        registerProvider(createAlipayProvider(parsed.alipay))
      }
      if (parsed.stripe) {
        registerProvider(createStripeProvider(parsed.stripe))
      }

      currentConfig = parsed
      logger.info('Payment module initialized', {
        providers: [
          parsed.wechat ? 'wechat' : null,
          parsed.alipay ? 'alipay' : null,
          parsed.stripe ? 'stripe' : null,
        ].filter(Boolean),
      })
      return ok(undefined)
    }
    catch (error) {
      logger.error('Payment module initialization failed', { error })
      return err({
        code: PaymentErrorCode.CONFIG_ERROR,
        message: paymentM('payment_initFailed', {
          params: { error: error instanceof Error ? error.message : String(error) },
        }),
        cause: error,
      })
    }
  },

  /**
   * 关闭模块、清除所有 Provider
   */
  async close(): Promise<void> {
    if (!currentConfig) {
      logger.info('Payment module already closed, skipping')
      return
    }
    logger.info('Closing payment module')
    clearProviders()
    currentConfig = null
    logger.info('Payment module closed')
  },

  get config() { return currentConfig },
  get isInitialized() { return currentConfig !== null },

  /** 创建支付订单 */
  createOrder: (...args: Parameters<typeof createOrder>) =>
    currentConfig ? createOrder(...args) : Promise.resolve(notInitialized.result<PaymentOrder>()),

  /** 处理异步回调通知 */
  handleNotify: (...args: Parameters<typeof handleNotify>) =>
    currentConfig ? handleNotify(...args) : Promise.resolve(notInitialized.result<PaymentNotifyResult>()),

  /** 查询订单状态 */
  queryOrder: (...args: Parameters<typeof queryOrder>) =>
    currentConfig ? queryOrder(...args) : Promise.resolve(notInitialized.result<OrderStatus>()),

  /** 发起退款 */
  refund: (...args: Parameters<typeof refund>) =>
    currentConfig ? refund(...args) : Promise.resolve(notInitialized.result<RefundResult>()),

  /** 关闭订单 */
  closeOrder: (...args: Parameters<typeof closeOrder>) =>
    currentConfig ? closeOrder(...args) : Promise.resolve(notInitialized.result<void>()),

  /** 获取已注册的 Provider */
  getProvider,

  /** 手动注册 Provider（自定义渠道） */
  registerProvider,
}
