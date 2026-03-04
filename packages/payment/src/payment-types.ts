/**
 * @h-ai/payment — 类型定义
 *
 * 统一支付模块的公共类型、Provider 接口与错误码。
 * @module payment-types
 */

import type { Result } from '@h-ai/core'

// ─── 错误码 ───

/** 支付模块错误码（7000-7099） */
export enum PaymentErrorCode {
  /** 创建订单失败 */
  CREATE_ORDER_FAILED = 7000,
  /** 查询订单失败 */
  QUERY_ORDER_FAILED = 7001,
  /** 退款失败 */
  REFUND_FAILED = 7002,
  /** 关闭订单失败 */
  CLOSE_ORDER_FAILED = 7003,
  /** 回调验签失败 */
  NOTIFY_VERIFY_FAILED = 7010,
  /** 回调解析失败 */
  NOTIFY_PARSE_FAILED = 7011,
  /** 签名失败 */
  SIGN_FAILED = 7020,
  /** Provider 未找到 */
  PROVIDER_NOT_FOUND = 7030,
  /** 金额无效 */
  INVALID_AMOUNT = 7040,
  /** 模块未初始化 */
  NOT_INITIALIZED = 7050,
  /** Web 支付调起失败 */
  INVOKE_WEB_FAILED = 7060,
  /** App 支付调起失败 */
  INVOKE_APP_FAILED = 7061,
}

/** 支付模块错误 */
export interface PaymentError {
  /** 错误码 */
  code: PaymentErrorCode
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

// ─── 配置 ───

/** 微信支付配置 */
export interface WechatPayConfig {
  /** 商户号 */
  mchId: string
  /** 商户 API v3 密钥 */
  apiV3Key: string
  /** 商户证书序列号 */
  serialNo: string
  /** 商户私钥（PEM 格式） */
  privateKey: string
  /** 微信支付平台证书（PEM 格式） */
  platformCert?: string
  /** 应用 ID */
  appId: string
}

/** 支付宝配置 */
export interface AlipayConfig {
  /** 应用 ID */
  appId: string
  /** 应用私钥（PEM 格式） */
  privateKey: string
  /** 支付宝公钥（PEM 格式） */
  alipayPublicKey: string
  /** 签名类型（默认 RSA2） */
  signType?: 'RSA2' | 'RSA'
  /** 是否沙箱模式 */
  sandbox?: boolean
}

/** Stripe 配置 */
export interface StripeConfig {
  /** Secret Key */
  secretKey: string
  /** Webhook Signing Secret */
  webhookSecret: string
}

/** 支付模块配置 */
export interface PaymentConfig {
  /** 微信支付配置 */
  wechat?: WechatPayConfig
  /** 支付宝配置 */
  alipay?: AlipayConfig
  /** Stripe 配置 */
  stripe?: StripeConfig
}
