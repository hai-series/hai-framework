/**
 * @h-ai/payment — 业务逻辑编排
 *
 * 统一路由到对应 Provider 的支付操作。
 * @module payment-functions
 */

import type { CreateAuditLogInput } from '@h-ai/audit'
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
import { audit } from '@h-ai/audit'
import { core, err, ok } from '@h-ai/core'
import { PaymentErrorCode } from './payment-config.js'
import { paymentM } from './payment-i18n.js'

const logger = core.logger.child({ module: 'payment', scope: 'functions' })

/** Provider 注册表 */
const providers = new Map<string, PaymentProvider>()

/**
 * 写审计日志（失败仅 warn，不影响支付操作）
 */
async function auditLog(input: CreateAuditLogInput): Promise<void> {
  const result = await audit.log(input)
  if (!result.success) {
    logger.warn('Failed to write payment audit log', { action: input.action, error: result.error.message })
  }
}

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
function requireProvider(name: string): Result<PaymentProvider, PaymentError> {
  const provider = providers.get(name)
  if (!provider) {
    return err({
      code: PaymentErrorCode.PROVIDER_NOT_FOUND,
      message: paymentM('payment_providerNotFound'),
    })
  }
  return ok(provider)
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
  if (!result.success)
    return result
  const orderResult = await result.data.createOrder(input)
  if (orderResult.success) {
    await auditLog({
      action: 'create_order',
      resource: 'payment',
      resourceId: input.orderNo,
      details: { provider: providerName, amount: input.amount, tradeType: input.tradeType },
    })
  }
  return orderResult
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
  if (!result.success)
    return result
  const notifyResult = await result.data.handleNotify(request)
  if (notifyResult.success) {
    await auditLog({
      action: 'payment_notify',
      resource: 'payment',
      resourceId: notifyResult.data.orderNo,
      details: { provider: providerName, transactionId: notifyResult.data.transactionId, status: notifyResult.data.status, amount: notifyResult.data.amount },
    })
  }
  return notifyResult
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
  if (!result.success)
    return result
  return result.data.queryOrder(orderNo)
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
  if (!result.success)
    return result
  const refundResult = await result.data.refund(input)
  if (refundResult.success) {
    await auditLog({
      action: 'refund',
      resource: 'payment',
      resourceId: input.orderNo,
      details: { provider: providerName, refundNo: input.refundNo, amount: input.amount },
    })
  }
  return refundResult
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
  if (!result.success)
    return result
  const closeResult = await result.data.closeOrder(orderNo)
  if (closeResult.success) {
    await auditLog({
      action: 'close_order',
      resource: 'payment',
      resourceId: orderNo,
      details: { provider: providerName },
    })
  }
  return closeResult
}

/**
 * 清空所有已注册 Provider（测试用）
 */
export function clearProviders(): void {
  providers.clear()
}
