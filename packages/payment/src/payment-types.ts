/**
 * @h-ai/payment — 类型定义
 *
 * 统一支付模块的公共类型、Provider 接口与错误类型。
 * @module payment-types
 */

import type { Result } from '@h-ai/core'
import type { PaymentConfig, PaymentConfigInput, PaymentErrorCodeType } from './payment-config.js'

// ─── 错误类型 ───

/** 支付模块错误 */
export interface PaymentError {
  /** 错误码 */
  code: PaymentErrorCodeType
  /** 错误描述 */
  message: string
  /** 原始错误 */
  cause?: unknown
}

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
  createOrder: (input: CreateOrderInput) => Promise<Result<PaymentOrder, PaymentError>>

  /** 处理异步通知回调（验签 + 解析） */
  handleNotify: (request: PaymentNotifyRequest) => Promise<Result<PaymentNotifyResult, PaymentError>>

  /** 查询订单状态 */
  queryOrder: (orderNo: string) => Promise<Result<OrderStatus, PaymentError>>

  /** 申请退款 */
  refund: (input: RefundInput) => Promise<Result<RefundResult, PaymentError>>

  /** 关闭订单 */
  closeOrder: (orderNo: string) => Promise<Result<void, PaymentError>>
}

// ─── 函数接口 ───

/** 支付模块函数接口 */
export interface PaymentFunctions {
  init: (config: PaymentConfigInput) => Promise<Result<void, PaymentError>>
  close: () => Promise<void>
  readonly config: PaymentConfig | null
  readonly isInitialized: boolean
  createOrder: (providerName: string, input: CreateOrderInput) => Promise<Result<PaymentOrder, PaymentError>>
  handleNotify: (providerName: string, request: PaymentNotifyRequest) => Promise<Result<PaymentNotifyResult, PaymentError>>
  queryOrder: (providerName: string, orderNo: string) => Promise<Result<OrderStatus, PaymentError>>
  refund: (providerName: string, input: RefundInput) => Promise<Result<RefundResult, PaymentError>>
  closeOrder: (providerName: string, orderNo: string) => Promise<Result<void, PaymentError>>
  getProvider: (name: string) => PaymentProvider | undefined
  registerProvider: (provider: PaymentProvider) => void
}
