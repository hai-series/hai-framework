/**
 * @h-ai/payment — 业务逻辑编排
 *
 * 统一路由到对应 Provider 的支付操作。
 * @module payment-functions
 */

import type { CreateAuditLogInput } from '@h-ai/audit'
import type { HaiResult } from '@h-ai/core'
import type { CreateOrderInput, OrderStatus, PaymentNotifyRequest, PaymentNotifyResult, PaymentOrder, PaymentProvider, RefundInput, RefundResult } from './payment-types.js'
import { audit } from '@h-ai/audit'
import { core, err, ok } from '@h-ai/core'
import { paymentM } from './payment-i18n.js'
import { HaiPaymentError } from './payment-types.js'

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

function isValidAmount(amount: number): boolean {
  return Number.isSafeInteger(amount) && amount > 0
}

function validateCreateOrderInput(input: CreateOrderInput): HaiResult<void> {
  if (!isValidAmount(input.amount)) {
    return err(
      HaiPaymentError.INVALID_AMOUNT,
      paymentM('payment_invalidAmount'),
    )
  }

  return ok(undefined)
}

function validateRefundInput(input: RefundInput): HaiResult<void> {
  if (!isValidAmount(input.amount)) {
    return err(
      HaiPaymentError.INVALID_AMOUNT,
      paymentM('payment_invalidAmount'),
    )
  }

  if (input.totalAmount !== undefined) {
    if (!isValidAmount(input.totalAmount) || input.totalAmount < input.amount) {
      return err(
        HaiPaymentError.INVALID_AMOUNT,
        paymentM('payment_invalidAmount'),
      )
    }
  }

  return ok(undefined)
}

/**
 * 注册支付 Provider
 *
 * @param provider - PaymentProvider 实例
 * @internal
 * @example 模块内部上下文
 * ```ts
 * function registerCustomProvider(provider: PaymentProvider) {
 *   registerProvider(provider)
 *   return getProvider(provider.name)
 * }
 * ```
 */
export function registerProvider(provider: PaymentProvider): void {
  providers.set(provider.name, provider)
}

/**
 * 获取已注册的 Provider
 *
 * @param name - Provider 名称
 * @returns Provider 实例（不存在返回 undefined）
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const provider = getProvider('stripe')
 * if (provider) {
 *   const result = await provider.queryOrder('ORDER_1')
 *   if (!result.success) throw new Error(result.error.message)
 * }
 * ```
 */
export function getProvider(name: string): PaymentProvider | undefined {
  return providers.get(name)
}

/**
 * 获取 Provider（不存在则返回 err）
 */
function requireProvider(name: string): HaiResult<PaymentProvider> {
  const provider = providers.get(name)
  if (!provider) {
    return err(
      HaiPaymentError.PROVIDER_NOT_FOUND,
      paymentM('payment_providerNotFound'),
    )
  }
  return ok(provider)
}

/**
 * 通过指定 Provider 创建订单
 *
 * @param providerName - Provider 名称（'wechat' | 'alipay' | 'stripe'）
 * @param input - 创建订单入参
 * @returns 成功返回客户端调起所需的订单参数；失败不代表渠道绝对没有执行，需遵循对应渠道幂等与核对规则。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * // 生命周期已注册目标 Provider；业务订单及退款标识已经持久化。
 * const result = await createOrder('stripe', {
 *   orderNo: 'ORDER_1', amount: 100, currency: 'CNY', description: '测试商品',
 *   tradeType: 'h5', notifyUrl: 'https://api.example.com/payment/notify/stripe',
 * })
 * if (!result.success) return result
 * return result
 * ```
 */
export async function createOrder(
  providerName: string,
  input: CreateOrderInput,
): Promise<HaiResult<PaymentOrder>> {
  const result = requireProvider(providerName)
  if (!result.success)
    return result

  const validateResult = validateCreateOrderInput(input)
  if (!validateResult.success)
    return validateResult as HaiResult<PaymentOrder>

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
 * @returns 验签及解析结果；仅 status=paid 表示已付款，宿主仍需持久核对和幂等履约。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * async function verifyStripeNotification(request: PaymentNotifyRequest) {
 *   const result = await handleNotify('stripe', request)
 *   if (!result.success) return result
 *   if (result.data.status === 'paid') {
 *     // 仅将验签结果交给宿主的共享事务履约；必须核对订单/金额/币种并持久去重。
 *   }
 *   return result
 * }
 * ```
 */
export async function handleNotify(
  providerName: string,
  request: PaymentNotifyRequest,
): Promise<HaiResult<PaymentNotifyResult>> {
  const result = requireProvider(providerName)
  if (!result.success)
    return result
  const notifyResult = await result.data.handleNotify(request)
  if (notifyResult.success) {
    await auditLog({
      action: 'payment_notify',
      resource: 'payment',
      resourceId: notifyResult.data.orderNo,
      details: { provider: providerName, transactionId: notifyResult.data.transactionId, eventId: notifyResult.data.eventId, status: notifyResult.data.status, amount: notifyResult.data.amount, currency: notifyResult.data.currency },
    })
  }
  return notifyResult
}

/**
 * 查询订单状态
 *
 * @param providerName - Provider 名称
 * @param orderNo - 商户订单号
 * @returns 成功返回渠道确认的订单状态；未知订单或渠道错误返回失败，不能默认为 pending。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * // 生命周期已注册目标 Provider；业务订单及退款标识已经持久化。
 * const result = await queryOrder('stripe', 'ORDER_1')
 * if (!result.success) return result
 * return result
 * ```
 */
export async function queryOrder(
  providerName: string,
  orderNo: string,
): Promise<HaiResult<OrderStatus>> {
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
 * @returns 成功返回本次退款受理状态；processing 不能视作退款完成。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * // 生命周期已注册目标 Provider；业务订单及退款标识已经持久化。
 * const result = await refund('stripe', { orderNo: 'ORDER_1', refundNo: 'REFUND_1', amount: 50 })
 * if (!result.success) return result
 * return result
 * ```
 */
export async function refund(
  providerName: string,
  input: RefundInput,
): Promise<HaiResult<RefundResult>> {
  const result = requireProvider(providerName)
  if (!result.success)
    return result

  const validateResult = validateRefundInput(input)
  if (!validateResult.success)
    return validateResult as HaiResult<RefundResult>

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
 * @returns 只有渠道确认订单已关闭或过期才成功；已支付、未知状态或渠道错误返回失败。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * // 生命周期已注册目标 Provider；业务订单及退款标识已经持久化。
 * const result = await closeOrder('stripe', 'ORDER_1')
 * if (!result.success) return result
 * return result
 * ```
 */
export async function closeOrder(
  providerName: string,
  orderNo: string,
): Promise<HaiResult<void>> {
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
 * 清空本进程的 Provider 调度注册表；生命周期关闭及隔离测试使用，不删除共享幂等记录。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * // 仅在停止接收支付调用之后，由 payment.close 清理当前进程的调度注册表。
 * clearProviders()
 * const unavailable = getProvider('stripe') // undefined；共享渠道操作记录不会被删除。
 * ```
 */
export function clearProviders(): void {
  providers.clear()
}
