/**
 * @h-ai/payment — 支付宝类型
 *
 * 支付宝 Open API 的内部请求/响应类型。
 * @module alipay-types
 */

/** 支付宝统一下单公共参数 */
export interface AlipayCommonParams {
  app_id: string
  method: string
  charset: string
  sign_type: string
  sign: string
  timestamp: string
  version: string
  notify_url: string
  biz_content: string
}

/** 支付宝下单 biz_content */
export interface AlipayOrderBizContent {
  out_trade_no: string
  total_amount: string
  subject: string
  product_code: string
  body?: string
  passback_params?: string
}

/** 支付宝回调参数 */
export interface AlipayNotifyParams {
  out_trade_no: string
  trade_no: string
  trade_status: string
  total_amount: string
  gmt_payment?: string
  [key: string]: string | undefined
}
