/**
 * @h-ai/payment — 类型定义
 *
 * 统一支付模块的公共类型、Provider 接口与错误类型。
 * @module payment-types
 */

import type { ErrorInfo, HaiResult } from '@h-ai/core'
import type { PaymentConfig, PaymentConfigInput } from './payment-config.js'
import { core } from '@h-ai/core'

// ─── 错误定义（照 @h-ai/core 范式） ───

const PaymentErrorInfo = {
  CREATE_ORDER_FAILED: '001:500',
  QUERY_ORDER_FAILED: '002:500',
  REFUND_FAILED: '003:500',
  CLOSE_ORDER_FAILED: '004:500',
  NOT_INITIALIZED: '010:500',
  SIGN_FAILED: '020:500',
  PROVIDER_NOT_FOUND: '030:404',
  INVALID_AMOUNT: '040:400',
  UNSUPPORTED_TRADE_TYPE: '041:400',
  INVALID_INPUT: '042:400',
  NOTIFY_VERIFY_FAILED: '050:400',
  NOTIFY_PARSE_FAILED: '051:400',
  INVOKE_WEB_FAILED: '060:500',
  CONFIG_ERROR: '070:500',
} as const satisfies ErrorInfo

/**
 * 支付错误码定义；调用方先判断 HaiResult.success，再按 code 分类处理。
 * @example
 * ```ts
 * import { payment, HaiPaymentError } from '@h-ai/payment'
 * const result = await payment.queryOrder('stripe', 'ORDER_1')
 * if (!result.success && result.error.code === HaiPaymentError.NOT_INITIALIZED.code) {
 *   // 应用启动流程应检查 init 结果，不能把未就绪查询当成未付款。
 *   throw new Error(result.error.message)
 * }
 * ```
 */
export const HaiPaymentError = core.error.buildHaiErrorsDef('payment', PaymentErrorInfo)

// ─── 支付场景 ───

/**
 * 已实现的支付场景：微信 jsapi，支付宝/Stripe h5；各 Provider 不接受其它组合。
 * @example
 * ```ts
 * import type { TradeType } from '@h-ai/payment'
 * const wechatScene: TradeType = 'jsapi'
 * const hostedPageScene: TradeType = 'h5'
 * ```
 */
export type TradeType = 'jsapi' | 'h5'

/**
 * 订单状态
 * @example
 * ```ts
 * import type { OrderStatusValue } from '@h-ai/payment'
 * function isPaid(status: OrderStatusValue): boolean {
 *   return status === 'paid' // pending、closed 和客户端跳转均不能证明付款。
 * }
 * ```
 */
export type OrderStatusValue = 'pending' | 'paid' | 'closed' | 'refunded' | 'failed'

// ─── 创建订单 ───

/**
 * 创建订单入参
 * @example
 * ```ts
 * import type { CreateOrderInput } from '@h-ai/payment'
 * const input: CreateOrderInput = {
 *   orderNo: 'ORDER_1', amount: 100, currency: 'CNY', description: '测试商品',
 *   tradeType: 'h5', notifyUrl: 'https://api.example.com/payment/notify/stripe',
 * }
 * // 微信改为 jsapi，并提供属于服务端 appId 的 openid；Stripe/支付宝使用 h5。
 * ```
 */
export interface CreateOrderInput {
  /** 商户订单号 */
  orderNo: string
  /** 金额（分） */
  amount: number
  /** 大写币种；微信/支付宝使用 CNY，Stripe 省略时使用 USD，必须与业务订单一致。 */
  currency?: string
  /** 商品描述 */
  description: string
  /** 支付场景：微信仅 jsapi，支付宝仅 h5，Stripe 仅 h5（托管 Checkout 页面）。 */
  tradeType: TradeType
  /** 微信公众号 openid，微信 jsapi 必填；必须属于服务端配置的 appId。 */
  userId?: string
  /** 异步通知 URL */
  notifyUrl: string
  /** 附加数据（透传） */
  metadata?: Record<string, string>
}

/**
 * 支付订单（返回给客户端调起支付）
 * @example
 * ```ts
 * import { payment, type PaymentOrder } from '@h-ai/payment'
 * // 应用已初始化 Stripe 与其共享 reldb；订单号由业务持久化生成。
 * const created = await payment.createOrder('stripe', {
 *   orderNo: 'ORDER_1', amount: 100, currency: 'CNY', description: '测试商品',
 *   tradeType: 'h5', notifyUrl: 'https://api.example.com/payment/notify/stripe',
 * })
 * if (!created.success) throw new Error(created.error.message)
 * const order: PaymentOrder = created.data
 * order.clientParams // 经受信应用接口交给 @h-ai/payment/client，不含商户私钥。
 * ```
 */
export interface PaymentOrder {
  /** Provider 名称 */
  provider: string
  /** 支付场景 */
  tradeType: TradeType
  /** 微信 JSAPI 签名字段、支付宝 { gateway, fields } POST 参数或 Stripe { checkoutUrl }；不含 HTML。 */
  clientParams: Record<string, unknown>
  /** 预支付 ID（如微信 prepay_id） */
  prepayId?: string
}

// ─── 回调通知 ───

/**
 * 回调请求（原始 HTTP 数据）
 * @example
 * ```ts
 * import type { PaymentNotifyRequest } from '@h-ai/payment'
 * async function rawNotification(request: Request): Promise<PaymentNotifyRequest> {
 *   return { body: await request.text(), headers: Object.fromEntries(request.headers) }
 *   // 必须保留原始 body；不能先 JSON.parse 再序列化后验签。
 * }
 * ```
 */
export interface PaymentNotifyRequest {
  /** 请求 body */
  body: string
  /** 请求 headers */
  headers: Record<string, string>
}

/**
 * 回调解析结果；验签与解析成功不等于已付款，履约前必须检查 status。
 *
 * 宿主需用共享持久存储核对订单、金额、币种并去重，阻止乱序事件倒退已完成状态。
 * @example
 * ```ts
 * import { payment, type PaymentNotifyRequest } from '@h-ai/payment'
 * async function verifyNotification(request: PaymentNotifyRequest) {
 *   const result = await payment.handleNotify('stripe', request)
 *   if (!result.success) return result
 *   if (result.data.status === 'paid') {
 *     // 宿主在共享业务事务中核对商户订单、金额、币种，并按 eventId 持久去重后履约。
 *   }
 *   return result // 验签成功的 pending 结果仍然不能发货。
 * }
 * ```
 */
export interface PaymentNotifyResult {
  /** 商户订单号 */
  orderNo: string
  /** 支付渠道交易号 */
  transactionId: string
  /** 渠道通知事件 ID：微信 id、支付宝 notify_id、Stripe event.id；宿主按渠道/商户命名空间持久去重。 */
  eventId: string
  /** 支付金额（分） */
  amount: number
  /** ISO 4217 大写币种；支付宝为 CNY，宿主必须与订单核对。 */
  currency: string
  /** 支付状态 */
  status: OrderStatusValue
  /** 渠道支付时间；Stripe 为支付成功事件的创建时间，非本次通知接收时间。 */
  paidAt?: Date
  /** 原始数据 */
  raw?: Record<string, unknown>
}

// ─── 查询订单 ───

/**
 * 订单状态查询结果
 * @example
 * ```ts
 * import { payment, type OrderStatus } from '@h-ai/payment'
 * const result = await payment.queryOrder('stripe', 'ORDER_1')
 * if (!result.success) throw new Error(result.error.message)
 * const status: OrderStatus = result.data
 * const hasPaymentConfirmation = status.status === 'paid'
 * ```
 */
export interface OrderStatus {
  /** 商户订单号 */
  orderNo: string
  /** 渠道交易号 */
  transactionId?: string
  /** 订单状态 */
  status: OrderStatusValue
  /** 金额（分） */
  amount: number
  /** 支付时间 */
  paidAt?: Date
}

// ─── 退款 ───

/**
 * 退款入参
 * @example
 * ```ts
 * import type { RefundInput } from '@h-ai/payment'
 * const refund: RefundInput = {
 *   orderNo: 'ORDER_1', refundNo: 'REFUND_1', amount: 50, totalAmount: 100, reason: '部分退货',
 * }
 * // 同一业务退款重试复用 refundNo，不能变更金额；微信必须提供原订单总额。
 * ```
 */
export interface RefundInput {
  /** 商户订单号 */
  orderNo: string
  /** 退款单号 */
  refundNo: string
  /** 退款金额（分） */
  amount: number
  /** 订单总金额（分），微信退款必填 */
  totalAmount?: number
  /** 退款原因 */
  reason?: string
}

/**
 * 退款结果
 * @example
 * ```ts
 * import { payment, type RefundResult } from '@h-ai/payment'
 * const result = await payment.refund('stripe', { orderNo: 'ORDER_1', refundNo: 'REFUND_1', amount: 50 })
 * if (!result.success) throw new Error(result.error.message)
 * const refund: RefundResult = result.data
 * const confirmed = refund.status === 'success' // processing 仅表示仍待渠道确认。
 * ```
 */
export interface RefundResult {
  /** 退款单号 */
  refundNo: string
  /** 渠道退款标识；支付宝返回原交易号，需同时使用 refundNo 标识本次退款。 */
  refundId: string
  /** 退款状态；支付宝 fund_change 为 N 或缺失时是 processing，须向渠道确认后才能判定退款成功。 */
  status: 'processing' | 'success' | 'failed'
}

// ─── Provider 接口 ───

/**
 * 支付 Provider 接口
 *
 * 各支付渠道（微信/支付宝/Stripe）实现此接口，
 * 由 payment 模块统一调度。
 * @example
 * ```ts
 * import { payment, type PaymentProvider } from '@h-ai/payment'
 * function registerPartner(provider: PaymentProvider) {
 *   // 实现方负责完整的创建、验签解析、查单、退款和关单契约，并返回 HaiResult。
 *   payment.registerProvider(provider)
 *   return payment.getProvider(provider.name)
 * }
 * ```
 */
export interface PaymentProvider {
  /** Provider 名称（如 'wechat', 'alipay', 'stripe'） */
  readonly name: string

  /** 创建完整客户端契约的订单；unsupported 场景返回失败，不能以空参数占位成功。 */
  createOrder: (input: CreateOrderInput) => Promise<HaiResult<PaymentOrder>>

  /** 对原始通知验签并解析；成功可为 pending，不能代替业务核对、持久去重和履约事务。 */
  handleNotify: (request: PaymentNotifyRequest) => Promise<HaiResult<PaymentNotifyResult>>

  /** 读取并核对指定商户订单的渠道状态；未知订单或未知状态必须返回失败。 */
  queryOrder: (orderNo: string) => Promise<HaiResult<OrderStatus>>

  /** 申请指定 refundNo 的退款；成功后还要区分 processing 与资金确认 success。 */
  refund: (input: RefundInput) => Promise<HaiResult<RefundResult>>

  /** 只有渠道确认关闭/过期才成功；禁止无操作返回成功或关闭已付款订单。 */
  closeOrder: (orderNo: string) => Promise<HaiResult<void>>
}

// ─── 函数接口 ───

/**
 * 支付模块函数接口
 * @example
 * ```ts
 * import { payment, type PaymentFunctions } from '@h-ai/payment'
 * const service: PaymentFunctions = payment
 * if (!service.isInitialized) throw new Error('Payment is not initialized')
 * const result = await service.queryOrder('stripe', 'ORDER_1')
 * if (!result.success) throw new Error(result.error.message)
 * ```
 */
export interface PaymentFunctions {
  /** 按 Schema 注册渠道；Stripe 要求共享 reldb 已初始化，失败后不能启动依赖支付的业务。 */
  init: (config: PaymentConfigInput) => Promise<HaiResult<void>>
  /** 清理本进程注册表与配置；不会删除持久幂等记录或关闭宿主 reldb，不返回 HaiResult。 */
  close: () => Promise<void>
  /** 当前解析后的配置，关闭或未初始化时为 null；包含密钥，禁止下发浏览器或记录日志。 */
  readonly config: PaymentConfig | null
  /** 是否已有成功发布的配置；不代表渠道实时可用或商户凭据已被远端验证。 */
  readonly isInitialized: boolean
  /** 创建订单并返回对应场景的最小客户端参数；调用方必须先检查 success。 */
  createOrder: (providerName: string, input: CreateOrderInput) => Promise<HaiResult<PaymentOrder>>
  /** 验签并解析原始回调；宿主核对金额/币种并持久去重后才可确认业务履约。 */
  handleNotify: (providerName: string, request: PaymentNotifyRequest) => Promise<HaiResult<PaymentNotifyResult>>
  /** 查渠道状态；失败不能映射成未付款或直接重建订单。 */
  queryOrder: (providerName: string, orderNo: string) => Promise<HaiResult<OrderStatus>>
  /** 退款标识与参数保持稳定；processing 仍需渠道核对，不能视作最终退款成功。 */
  refund: (providerName: string, input: RefundInput) => Promise<HaiResult<RefundResult>>
  /** 主动关单；Stripe 只在确认 Session expired 后成功，页面返回不是关单证明。 */
  closeOrder: (providerName: string, orderNo: string) => Promise<HaiResult<void>>
  /** 按名称读取本进程 Provider；未注册时为 undefined，应用通常使用统一操作入口。 */
  getProvider: (name: string) => PaymentProvider | undefined
  /** 注册完整实现 PaymentProvider 的自定义渠道；同名会替换本进程注册项，生命周期由宿主协调。 */
  registerProvider: (provider: PaymentProvider) => void
}
