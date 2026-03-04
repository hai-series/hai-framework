/**
 * @h-ai/payment — 业务逻辑编排
 *
 * 统一路由到对应 Provider 的支付操作。
 * @module payment-functions
 */

import type { Result } from '@h-ai/core'
import type {
  CreateOrderInput,
  OrderStatus,
  PaymentError,
  PaymentNotifyRequest,
  PaymentNotifyResult,
  PaymentOrder,
  PaymentProvider,
  RefundInput,
  RefundResult,
} from './payment-types.js'
import { err } from '@h-ai/core'
import { paymentM } from './payment-i18n.js'
import { PaymentErrorCode } from './payment-types.js'

/** Provider 注册表 */
const providers = new Map<string, PaymentProvider>()

/**
 * 注册支付 Provider
 *
 * @param provider - PaymentProvider 实例
 */
export function registerProvider(provider: PaymentProvider): void {
  providers.set(provider.name, provider)
}

/**
 * 获取已注册的 Provider
 *
 * @param name - Provider 名称
 * @returns Provider 实例（不存在返回 undefined）
 */
export function getProvider(name: string): PaymentProvider | undefined {
  return providers.get(name)
}

/**
 * 获取 Provider（不存在则返回 err）
 */
function requireProvider(name: string): Result<PaymentProvider, PaymentError> | PaymentProvider {
  const provider = providers.get(name)
  if (!provider) {
    return err({
      code: PaymentErrorCode.PROVIDER_NOT_FOUND,
      message: paymentM('payment_providerNotFound'),
    }) as Result<PaymentProvider, PaymentError>
  }
  return provider
}

/**
 * 通过指定 Provider 创建订单
 *
 * @param providerName - Provider 名称（'wechat' | 'alipay' | 'stripe'）
 * @param input - 创建订单入参
 */
export async function createOrder(
  providerName: string,
  input: CreateOrderInput,
): Promise<Result<PaymentOrder, PaymentError>> {
  const result = requireProvider(providerName)
  if ('success' in result && !result.success)
    return result
  const provider = result as PaymentProvider
  return provider.createOrder(input)
}

/**
 * 处理支付回调通知
 *
 * @param providerName - Provider 名称
 * @param request - 原始 HTTP 请求数据
 */
export async function handleNotify(
  providerName: string,
  request: PaymentNotifyRequest,
): Promise<Result<PaymentNotifyResult, PaymentError>> {
  const result = requireProvider(providerName)
  if ('success' in result && !result.success)
    return result
  const provider = result as PaymentProvider
  return provider.handleNotify(request)
}

/**
 * 查询订单状态
 *
 * @param providerName - Provider 名称
 * @param orderNo - 商户订单号
 */
export async function queryOrder(
  providerName: string,
  orderNo: string,
): Promise<Result<OrderStatus, PaymentError>> {
  const result = requireProvider(providerName)
  if ('success' in result && !result.success)
    return result
  const provider = result as PaymentProvider
  return provider.queryOrder(orderNo)
}

/**
 * 发起退款
 *
 * @param providerName - Provider 名称
 * @param input - 退款入参
 */
export async function refund(
  providerName: string,
  input: RefundInput,
): Promise<Result<RefundResult, PaymentError>> {
  const result = requireProvider(providerName)
  if ('success' in result && !result.success)
    return result
  const provider = result as PaymentProvider
  return provider.refund(input)
}

/**
 * 关闭订单
 *
 * @param providerName - Provider 名称
 * @param orderNo - 商户订单号
 */
export async function closeOrder(
  providerName: string,
  orderNo: string,
): Promise<Result<void, PaymentError>> {
  const result = requireProvider(providerName)
  if ('success' in result && !result.success)
    return result
  const provider = result as PaymentProvider
  return provider.closeOrder(orderNo)
}

/**
 * 清空所有已注册 Provider（测试用）
 */
export function clearProviders(): void {
  providers.clear()
}
