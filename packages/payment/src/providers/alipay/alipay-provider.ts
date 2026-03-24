/**
 * @h-ai/payment — 支付宝 Provider
 *
 * 实现 PaymentProvider 接口，对接支付宝 Open API。
 * @module alipay-provider
 */

import type { HaiResult } from '@h-ai/core'
import type { AlipayConfig } from '../../payment-config.js'
import type { CreateOrderInput, OrderStatus, PaymentNotifyRequest, PaymentNotifyResult, PaymentOrder, PaymentProvider, RefundInput, RefundResult } from '../../payment-types.js'
import type { AlipayNotifyParams } from './alipay-types.js'
import { err, ok } from '@h-ai/core'
import { paymentM } from '../../payment-i18n.js'
import {

  HaiPaymentError,

} from '../../payment-types.js'
import { signAlipayParams, verifyAlipayNotify } from './alipay-sign.js'

/** 支付宝网关地址 */
const ALIPAY_GATEWAY = 'https://openapi.alipay.com/gateway.do'
const ALIPAY_SANDBOX_GATEWAY = 'https://openapi-sandbox.dl.alipaydev.com/gateway.do'

/**
 * 创建支付宝 Provider
 *
 * @param config - 支付宝配置
 * @returns PaymentProvider 实例
 */
export function createAlipayProvider(config: AlipayConfig): PaymentProvider {
  const gateway = config.sandbox ? ALIPAY_SANDBOX_GATEWAY : ALIPAY_GATEWAY
  const signType = config.signType ?? 'RSA2'

  /** 构建公共参数 */
  function buildCommonParams(method: string, notifyUrl: string): Record<string, string> {
    return {
      app_id: config.appId,
      method,
      charset: 'utf-8',
      sign_type: signType,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
      version: '1.0',
      notify_url: notifyUrl,
    }
  }

  /** 根据 tradeType 映射到产品码和 API */
  function getTradeConfig(tradeType: string): { method: string, productCode: string } {
    const map: Record<string, { method: string, productCode: string }> = {
      jsapi: { method: 'alipay.trade.create', productCode: 'JSAPI_PAY' },
      h5: { method: 'alipay.trade.wap.pay', productCode: 'QUICK_WAP_WAY' },
      app: { method: 'alipay.trade.app.pay', productCode: 'QUICK_MSECURITY_PAY' },
      native: { method: 'alipay.trade.precreate', productCode: 'FACE_TO_FACE_PAYMENT' },
    }
    return map[tradeType] ?? map.h5
  }

  /** 发送支付宝 API 请求 */
  async function alipayRequest<T>(params: Record<string, string>): Promise<T> {
    const sign = signAlipayParams(params, config.privateKey, signType)
    const allParams = { ...params, sign }

    const queryString = Object.entries(allParams)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&')

    const response = await fetch(`${gateway}?${queryString}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })

    if (!response.ok) {
      throw new Error(`Alipay API failed: ${response.status}`)
    }

    return response.json() as T
  }

  return {
    name: 'alipay',

    async createOrder(input: CreateOrderInput): Promise<HaiResult<PaymentOrder>> {
      try {
        const { method, productCode } = getTradeConfig(input.tradeType)

        const bizContent = JSON.stringify({
          out_trade_no: input.orderNo,
          total_amount: (input.amount / 100).toFixed(2), // 分 → 元
          subject: input.description,
          product_code: productCode,
          passback_params: input.metadata ? JSON.stringify(input.metadata) : undefined,
        })

        const params = {
          ...buildCommonParams(method, input.notifyUrl),
          biz_content: bizContent,
        }

        const response = await alipayRequest<Record<string, unknown>>(params)
        const key = `${method.replace(/\./g, '_')}_response`
        const data = response[key] as Record<string, unknown> | undefined

        return ok({
          provider: 'alipay',
          tradeType: input.tradeType,
          clientParams: data ?? {},
          prepayId: data?.trade_no as string | undefined,
        })
      }
      catch (cause) {
        return err(
          HaiPaymentError.CREATE_ORDER_FAILED,
          paymentM('payment_createOrderFailed'),
          cause,
        )
      }
    },

    async handleNotify(request: PaymentNotifyRequest): Promise<HaiResult<PaymentNotifyResult>> {
      try {
        // 解析 form-urlencoded body
        const params: AlipayNotifyParams = {} as AlipayNotifyParams
        const pairs = request.body.split('&')
        for (const pair of pairs) {
          const [key, ...rest] = pair.split('=')
          params[decodeURIComponent(key)] = decodeURIComponent(rest.join('='))
        }

        // 验签
        const valid = verifyAlipayNotify(params as Record<string, string>, config.alipayPublicKey)
        if (!valid) {
          return err(
            HaiPaymentError.NOTIFY_VERIFY_FAILED,
            paymentM('payment_notifyVerifyFailed'),
          )
        }

        const statusMap: Record<string, PaymentNotifyResult['status']> = {
          TRADE_SUCCESS: 'paid',
          TRADE_CLOSED: 'closed',
          TRADE_FINISHED: 'paid',
          WAIT_BUYER_PAY: 'pending',
        }

        return ok({
          orderNo: params.out_trade_no,
          transactionId: params.trade_no,
          amount: Math.round(Number.parseFloat(params.total_amount) * 100), // 元 → 分
          status: statusMap[params.trade_status] ?? 'pending',
          paidAt: params.gmt_payment ? new Date(params.gmt_payment) : undefined,
          raw: params as unknown as Record<string, unknown>,
        })
      }
      catch (cause) {
        return err(
          HaiPaymentError.NOTIFY_PARSE_FAILED,
          paymentM('payment_notifyParseFailed'),
          cause,
        )
      }
    },

    async queryOrder(orderNo: string): Promise<HaiResult<OrderStatus>> {
      try {
        const method = 'alipay.trade.query'
        const params = {
          ...buildCommonParams(method, ''),
          biz_content: JSON.stringify({ out_trade_no: orderNo }),
        }

        const response = await alipayRequest<Record<string, unknown>>(params)
        const data = response.alipay_trade_query_response as Record<string, unknown> | undefined

        const statusMap: Record<string, OrderStatus['status']> = {
          TRADE_SUCCESS: 'paid',
          TRADE_CLOSED: 'closed',
          TRADE_FINISHED: 'paid',
          WAIT_BUYER_PAY: 'pending',
        }

        return ok({
          orderNo,
          transactionId: data?.trade_no as string | undefined,
          status: statusMap[data?.trade_status as string] ?? 'pending',
          amount: Math.round(Number.parseFloat(data?.total_amount as string ?? '0') * 100),
          paidAt: data?.send_pay_date ? new Date(data.send_pay_date as string) : undefined,
        })
      }
      catch (cause) {
        return err(
          HaiPaymentError.QUERY_ORDER_FAILED,
          paymentM('payment_queryOrderFailed'),
          cause,
        )
      }
    },

    async refund(input: RefundInput): Promise<HaiResult<RefundResult>> {
      try {
        const method = 'alipay.trade.refund'
        const params = {
          ...buildCommonParams(method, ''),
          biz_content: JSON.stringify({
            out_trade_no: input.orderNo,
            out_request_no: input.refundNo,
            refund_amount: (input.amount / 100).toFixed(2),
            refund_reason: input.reason,
          }),
        }

        const response = await alipayRequest<Record<string, unknown>>(params)
        const data = response.alipay_trade_refund_response as Record<string, unknown> | undefined

        return ok({
          refundNo: input.refundNo,
          refundId: data?.trade_no as string ?? '',
          status: data?.fund_change === 'Y' ? 'success' : 'processing',
        })
      }
      catch (cause) {
        return err(
          HaiPaymentError.REFUND_FAILED,
          paymentM('payment_refundFailed'),
          cause,
        )
      }
    },

    async closeOrder(orderNo: string): Promise<HaiResult<void>> {
      try {
        const method = 'alipay.trade.close'
        const params = {
          ...buildCommonParams(method, ''),
          biz_content: JSON.stringify({ out_trade_no: orderNo }),
        }

        await alipayRequest(params)
        return ok(undefined)
      }
      catch (cause) {
        return err(
          HaiPaymentError.CLOSE_ORDER_FAILED,
          paymentM('payment_closeOrderFailed'),
          cause,
        )
      }
    },
  }
}
