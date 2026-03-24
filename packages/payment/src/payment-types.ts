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
  NOTIFY_VERIFY_FAILED: '050:400',
  NOTIFY_PARSE_FAILED: '051:400',
  INVOKE_WEB_FAILED: '060:500',
  INVOKE_APP_FAILED: '061:500',
  CONFIG_ERROR: '070:500',
} as const satisfies ErrorInfo

export const HaiPaymentError = core.error.buildHaiErrorsDef('payment', PaymentErrorInfo)

// ─── 支付场景 ───

/** 支付场景（tradeType） */
export type TradeType = 'jsapi' | 'h5' | 'app' | 'native' | 'mini_program'

/** 订单状态 */
export type OrderStatusValue = 'pending' | 'paid' | 'closed' | 'refunded' | 'failed'

// ─── 创建订单 ───

/** 创建订单入参 */
export interface CreateOrderInput {
  /** 商户订单号 */
  orderNo: string
  /** 金额（分） */
  amount: number
  /** 币种（默认 CNY） */
  currency?: string
  /** 商品描述 */
  description: string
  /** 支付场景 */
  tradeType: TradeType
  /** 用户标识（微信 openid 等，jsapi 必填） */
  userId?: string
  /** 异步通知 URL */
  notifyUrl: string
  /** 附加数据（透传） */
  metadata?: Record<string, string>
}

/** 支付订单（返回给客户端调起支付） */
export interface PaymentOrder {
  /** Provider 名称 */
  provider: string
  /** 支付场景 */
  tradeType: TradeType
  /** 客户端调起参数（各平台差异） */
  clientParams: Record<string, unknown>
  /** 预支付 ID（如微信 prepay_id） */
  prepayId?: string
}

// ─── 回调通知 ───

/** 回调请求（原始 HTTP 数据） */
export interface PaymentNotifyRequest {
  /** 请求 body */
  body: string
  /** 请求 headers */
  headers: Record<string, string>
}

/** 回调解析结果 */
export interface PaymentNotifyResult {
  /** 商户订单号 */
  orderNo: string
  /** 支付渠道交易号 */
  transactionId: string
  /** 支付金额（分） */
  amount: number
  /** 支付状态 */
  status: OrderStatusValue
  /** 支付时间 */
  paidAt?: Date
  /** 原始数据 */
  raw?: Record<string, unknown>
}

// ─── 查询订单 ───

/** 订单状态查询结果 */
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

/** 退款入参 */
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

/** 退款结果 */
export interface RefundResult {
  /** 退款单号 */
  refundNo: string
  /** 渠道退款 ID */
  refundId: string
  /** 退款状态 */
  status: 'processing' | 'success' | 'failed'
}

// ─── Provider 接口 ───

/**
 * 支付 Provider 接口
 *
 * 各支付渠道（微信/支付宝/Stripe）实现此接口，
 * 由 payment 模块统一调度。
 */
export interface PaymentProvider {
  /** Provider 名称（如 'wechat', 'alipay', 'stripe'） */
  readonly name: string

  /** 创建支付订单 */
  createOrder: (input: CreateOrderInput) => Promise<HaiResult<PaymentOrder>>

  /** 处理异步通知回调（验签 + 解析） */
  handleNotify: (request: PaymentNotifyRequest) => Promise<HaiResult<PaymentNotifyResult>>

  /** 查询订单状态 */
  queryOrder: (orderNo: string) => Promise<HaiResult<OrderStatus>>

  /** 申请退款 */
  refund: (input: RefundInput) => Promise<HaiResult<RefundResult>>

  /** 关闭订单 */
  closeOrder: (orderNo: string) => Promise<HaiResult<void>>
}

// ─── 函数接口 ───

/** 支付模块函数接口 */
export interface PaymentFunctions {
  init: (config: PaymentConfigInput) => Promise<HaiResult<void>>
  close: () => Promise<void>
  readonly config: PaymentConfig | null
  readonly isInitialized: boolean
  createOrder: (providerName: string, input: CreateOrderInput) => Promise<HaiResult<PaymentOrder>>
  handleNotify: (providerName: string, request: PaymentNotifyRequest) => Promise<HaiResult<PaymentNotifyResult>>
  queryOrder: (providerName: string, orderNo: string) => Promise<HaiResult<OrderStatus>>
  refund: (providerName: string, input: RefundInput) => Promise<HaiResult<RefundResult>>
  closeOrder: (providerName: string, orderNo: string) => Promise<HaiResult<void>>
  getProvider: (name: string) => PaymentProvider | undefined
  registerProvider: (provider: PaymentProvider) => void
}
