/**
 * @h-ai/payment/client — Web/H5 支付调起
 *
 * 在浏览器或 H5 环境中调起微信/支付宝支付。
 * @module payment-client-web
 */

import type { HaiResult } from '@h-ai/core'
import type { PaymentOrder } from '../payment-types.js'
import type { InvokePaymentResult } from './payment-client-types.js'
import { err, ok } from '@h-ai/core'
import { paymentM } from '../payment-i18n.js'
import { HaiPaymentError } from '../payment-types.js'

/**
 * Web/H5 环境调起微信支付（JSAPI）
 *
 * 需要在微信内置浏览器中使用，依赖 WeixinJSBridge。
 */
function invokeWechatJsapi(clientParams: Record<string, unknown>): Promise<InvokePaymentResult> {
  return new Promise((resolve) => {
    const WeixinJSBridge = (window as unknown as Record<string, unknown>).WeixinJSBridge as {
      invoke: (api: string, params: unknown, callback: (res: { err_msg: string }) => void) => void
    } | undefined

    if (!WeixinJSBridge) {
      resolve({ invoked: false, message: 'WeixinJSBridge not available' })
      return
    }

    WeixinJSBridge.invoke('getBrandWCPayRequest', clientParams, (res) => {
      resolve({
        invoked: true,
        message: res.err_msg,
      })
    })
  })
}

/**
 * Web/H5 环境调起微信 H5 支付
 *
 * 通过跳转 URL 唤起微信客户端支付。
 */
function invokeWechatH5(clientParams: Record<string, unknown>): InvokePaymentResult {
  const h5Url = clientParams.h5Url as string | undefined
  if (h5Url) {
    window.location.href = h5Url
    return { invoked: true }
  }
  return { invoked: false, message: 'Missing h5Url' }
}

/**
 * Web 环境调起支付宝（H5 跳转）
 */
function invokeAlipayH5(clientParams: Record<string, unknown>): InvokePaymentResult {
  const formHtml = clientParams.form as string | undefined
  const payUrl = clientParams.pay_url as string | undefined

  if (formHtml) {
    // 支付宝返回的 HTML form，使用 DOMParser 安全解析后提交
    const parser = new DOMParser()
    const doc = parser.parseFromString(formHtml, 'text/html')
    const form = doc.querySelector('form')
    if (form) {
      document.body.appendChild(document.adoptNode(form))
      form.submit()
      return { invoked: true }
    }
    return { invoked: false, message: 'No form element found in response' }
  }

  if (payUrl) {
    window.location.href = payUrl
    return { invoked: true }
  }

  return { invoked: false, message: 'Missing alipay form or pay_url' }
}

/**
 * Web 环境调起 Stripe Checkout
 */
function invokeStripeCheckout(clientParams: Record<string, unknown>): InvokePaymentResult {
  const checkoutUrl = clientParams.checkoutUrl as string | undefined
  if (checkoutUrl) {
    window.location.href = checkoutUrl
    return { invoked: true }
  }
  return { invoked: false, message: 'Missing checkoutUrl' }
}

/**
 * 调起支付（Web / H5 通用入口）
 *
 * 根据 PaymentOrder 中的 provider 和 tradeType 自动选择调起方式。
 *
 * @param order - 后端返回的支付订单
 * @returns 调起结果
 *
 * @example
 * ```ts
 * import { invokePayment } from '@h-ai/payment/client'
 *
 * const orderResult = await api.call(paymentEndpoints.create, { ... })
 * if (orderResult.success) {
 *   const result = await invokePayment(orderResult.data)
 * }
 * ```
 */
export async function invokePayment(order: PaymentOrder): Promise<HaiResult<InvokePaymentResult>> {
  try {
    let result: InvokePaymentResult

    switch (order.provider) {
      case 'wechat':
        if (order.tradeType === 'jsapi') {
          result = await invokeWechatJsapi(order.clientParams)
        }
        else {
          result = invokeWechatH5(order.clientParams)
        }
        break
      case 'alipay':
        result = invokeAlipayH5(order.clientParams)
        break
      case 'stripe':
        result = invokeStripeCheckout(order.clientParams)
        break
      default:
        return err(
          HaiPaymentError.INVOKE_WEB_FAILED,
          paymentM('payment_invokeWebFailed'),
        )
    }

    return ok(result)
  }
  catch (cause) {
    return err(
      HaiPaymentError.INVOKE_WEB_FAILED,
      paymentM('payment_invokeWebFailed'),
      cause,
    )
  }
}
