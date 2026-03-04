/**
 * @h-ai/payment — 微信支付类型
 *
 * 微信支付 API v3 的内部请求/响应类型。
 * @module wechat-pay-types
 */

/** 微信统一下单请求（JSAPI / H5 / App / Native） */
export interface WechatOrderRequest {
  appid: string
  mchid: string
  description: string
  out_trade_no: string
  notify_url: string
  amount: {
    total: number
    currency: string
  }
  payer?: {
    openid: string
  }
  scene_info?: {
    payer_client_ip: string
    h5_info?: {
      type: string
    }
  }
  attach?: string
}

/** 微信下单响应 */
export interface WechatOrderResponse {
  prepay_id?: string
  h5_url?: string
  code_url?: string
}

/** 微信 JSAPI 支付参数（客户端调起） */
export interface WechatJsapiParams {
  appId: string
  timeStamp: string
  nonceStr: string
  package: string
  signType: string
  paySign: string
}

/** 微信回调通知解密后内容 */
export interface WechatNotifyResource {
  out_trade_no: string
  transaction_id: string
  trade_state: string
  amount: {
    total: number
    payer_total: number
    currency: string
  }
  success_time: string
}
