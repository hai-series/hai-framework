/**
 * @h-ai/payment/client — 浏览器支付调起
 *
 * 微信 JSAPI、支付宝 WAP 表单与 Stripe 托管页面使用各自完整的客户端协议。
 * @module payment-client-web
 */

import type { HaiResult } from '@h-ai/core'
import type { PaymentOrder } from '../payment-types.js'
import type { InvokePaymentResult } from './payment-client-types.js'
import { err, ok } from '@h-ai/core'
import { paymentM } from '../payment-i18n.js'
import { HaiPaymentError } from '../payment-types.js'

/** 微信内置浏览器注入的公众号支付桥接对象。 */
interface WechatPaymentBridge {
  invoke: (api: string, params: Record<string, unknown>, callback: (response: { err_msg: string }) => void) => void
}

/** 验证必填的字符串字段，拒绝空参数被浏览器当作已成功调起。 */
function requireStrings(params: Record<string, unknown>, fields: readonly string[]): void {
  if (fields.some(field => typeof params[field] !== 'string' || !params[field].trim()))
    throw new Error('Invalid payment client parameters')
}

/** 微信 JSAPI 只在桥接对象已就绪时调起；回调仅表示客户端响应，不能证明已付款。 */
function invokeWechatJsapi(clientParams: Record<string, unknown>): Promise<InvokePaymentResult> {
  requireStrings(clientParams, ['appId', 'timeStamp', 'nonceStr', 'package', 'signType', 'paySign'])
  if (clientParams.signType !== 'RSA' || !/^prepay_id=.+$/.test(String(clientParams.package))
    || !/^\d+$/.test(String(clientParams.timeStamp))) {
    throw new Error('Invalid Wechat JSAPI parameters')
  }
  const bridge = (window as Window & { WeixinJSBridge?: WechatPaymentBridge }).WeixinJSBridge
  if (typeof bridge?.invoke !== 'function')
    return Promise.resolve({ invoked: false, message: paymentM('payment_wechatBridgeUnavailable') })
  return new Promise((resolve) => {
    bridge.invoke('getBrandWCPayRequest', clientParams, (response) => {
      resolve({ invoked: true, message: response.err_msg })
    })
  })
}

/** 支付宝 WAP 仅向固定网关 POST 签名字段；不解析 HTML，也不将业务数据放进 URL。 */
function invokeAlipayH5(clientParams: Record<string, unknown>): InvokePaymentResult {
  const { gateway, fields } = clientParams
  if ((gateway !== 'https://openapi.alipay.com/gateway.do'
    && gateway !== 'https://openapi-sandbox.dl.alipaydev.com/gateway.do')
  || Object.keys(clientParams).some(key => key !== 'gateway' && key !== 'fields')
  || typeof fields !== 'object' || fields === null || Array.isArray(fields)) {
    throw new Error('Invalid Alipay page parameters')
  }
  const required = ['app_id', 'method', 'format', 'charset', 'sign_type', 'timestamp', 'version', 'notify_url', 'return_url', 'biz_content', 'sign']
  const entries: Array<[string, string]> = []
  for (const [key, value] of Object.entries(fields) as Array<[string, unknown]>) {
    if (!required.includes(key) || typeof value !== 'string' || !value.trim())
      throw new Error('Invalid Alipay form fields')
    entries.push([key, value])
  }
  if (entries.length !== required.length)
    throw new Error('Invalid Alipay form fields')
  const params = Object.fromEntries(entries)
  if (params.method !== 'alipay.trade.wap.pay' || params.format !== 'JSON' || params.charset !== 'utf-8' || params.version !== '1.0'
    || (params.sign_type !== 'RSA2' && params.sign_type !== 'RSA')) {
    throw new Error('Invalid Alipay form method')
  }
  // 逐个构造 input，字段值中的引号、尖括号和脚本始终只是文本。
  const form = document.createElement('form')
  form.action = gateway
  form.method = 'POST'
  form.acceptCharset = 'utf-8'
  for (const [key, value] of entries) {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = key
    input.value = value
    form.appendChild(input)
  }
  document.body.appendChild(form)
  try {
    form.submit()
    return { invoked: true }
  }
  finally {
    form.remove()
  }
}

/** Stripe 托管页使用 HTTPS 跳转，禁止 javascript/file 等可执行或本地协议。 */
function invokeStripeCheckout(clientParams: Record<string, unknown>): InvokePaymentResult {
  requireStrings(clientParams, ['checkoutUrl'])
  const checkoutUrl = new URL(String(clientParams.checkoutUrl))
  if (checkoutUrl.protocol !== 'https:' || checkoutUrl.username || checkoutUrl.password)
    throw new Error('Invalid Stripe Checkout URL')
  window.location.href = checkoutUrl.href
  return { invoked: true }
}

/**
 * 按服务端返回的渠道与场景调起支付；不支持的组合直接返回错误。
 *
 * 调用前等待微信 WeixinJSBridgeReady；invoked 只表示已提交调起，付款状态由服务端确认。
 *
 * @param order - 服务端创建的支付订单
 * @returns 调起结果；失败时应向用户提示并允许重试。
 * @example
 * ```ts
 * import { invokePayment } from '@h-ai/payment/client'
 * import type { PaymentOrder } from '@h-ai/payment'
 *
 * const order: PaymentOrder = {
 *   provider: 'stripe', tradeType: 'h5',
 *   clientParams: { checkoutUrl: 'https://checkout.stripe.com/pay/server-session' },
 * }
 * const result = await invokePayment(order)
 * if (!result.success) throw new Error(result.error.message)
 * if (!result.data.invoked) throw new Error(result.data.message)
 * ```
 */
export async function invokePayment(order: PaymentOrder): Promise<HaiResult<InvokePaymentResult>> {
  try {
    switch (order.provider) {
      case 'wechat':
        if (order.tradeType === 'jsapi')
          return ok(await invokeWechatJsapi(order.clientParams))
        break
      case 'alipay':
        if (order.tradeType === 'h5')
          return ok(invokeAlipayH5(order.clientParams))
        break
      case 'stripe':
        if (order.tradeType === 'h5')
          return ok(invokeStripeCheckout(order.clientParams))
        break
    }
    return err(HaiPaymentError.UNSUPPORTED_TRADE_TYPE, paymentM('payment_unsupportedTradeType'))
  }
  catch (cause) {
    return err(HaiPaymentError.INVOKE_WEB_FAILED, paymentM('payment_invokeWebFailed'), cause)
  }
}
