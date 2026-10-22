/**
 * @h-ai/payment — 支付宝 Provider
 *
 * 实现 PaymentProvider 接口，对接支付宝 Open API。
 * @module alipay-provider
 */

import type { HaiResult } from '@h-ai/core'
import type { ZodType } from 'zod'
import type { AlipayConfig } from '../../payment-config.js'
import type { CreateOrderInput, OrderStatus, PaymentNotifyRequest, PaymentNotifyResult, PaymentOrder, PaymentProvider, RefundInput, RefundResult } from '../../payment-types.js'
import type { AlipayNotifyParams } from './alipay-types.js'
import { err, ok } from '@h-ai/core'
import { paymentM } from '../../payment-i18n.js'
import { HaiPaymentError } from '../../payment-types.js'
import { fetchWithTimeout } from '../payment-provider-http.js'
import { signAlipayParams, verifyAlipayNotify } from './alipay-sign.js'
import { AlipayCloseResponseSchema, AlipayCreateResponseSchema, AlipayNotifyParamsSchema, AlipayQueryResponseSchema, AlipayRefundResponseSchema, AlipayResponseRootSchema, AlipayResponseSchema } from './alipay-types.js'

/** 支付宝网关地址 */
const ALIPAY_GATEWAY = 'https://openapi.alipay.com/gateway.do'
const ALIPAY_SANDBOX_GATEWAY = 'https://openapi-sandbox.dl.alipaydev.com/gateway.do'

function formatFenAmount(amount: number): string {
  const yuan = Math.floor(amount / 100)
  const cents = String(amount % 100).padStart(2, '0')
  return `${yuan}.${cents}`
}

function parseAlipayAmount(value: string): number {
  const trimmedValue = value.trim()
  if (!/^\d+(?:\.\d{1,2})?$/.test(trimmedValue)) {
    throw new Error('Invalid Alipay amount')
  }

  const [yuanPart, centsPart = ''] = trimmedValue.split('.')
  const amount = Number.parseInt(yuanPart, 10) * 100 + Number.parseInt(centsPart.padEnd(2, '0'), 10)
  if (!Number.isSafeInteger(amount)) {
    throw new TypeError('Invalid Alipay amount')
  }
  return amount
}

function parseAlipayNotifyParams(body: string): AlipayNotifyParams {
  const parseResult = AlipayNotifyParamsSchema.safeParse(Object.fromEntries(new URLSearchParams(body).entries()))
  if (!parseResult.success) {
    throw parseResult.error
  }

  return parseResult.data
}

/**
 * 创建支付宝 Provider
 *
 * @param config - 支付宝配置
 * @returns PaymentProvider 实例
 * @example
 * const provider = createAlipayProvider(config)
 * const result = await provider.queryOrder('ORDER_1')
 * if (result.success && result.data.status === 'paid') await fulfillOrder(result.data)
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

  /**
   * 发送请求并核验对应方法的业务响应，再解析操作所需字段。
   *
   * HTTP 200 不代表业务成功；禁止把错误对象、原始响应或 Zod 输入放入 cause。
   * @example await alipayRequest(params, AlipayCloseResponseSchema)
   */
  async function alipayRequest<T>(params: Record<string, string>, schema: ZodType<T>): Promise<T> {
    const sign = signAlipayParams(params, config.privateKey, signType)
    const allParams = { ...params, sign }

    const queryString = Object.entries(allParams)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&')

    const timedResponse = await fetchWithTimeout(`${gateway}?${queryString}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })

    if (!timedResponse.ok) {
      throw new Error(`Alipay API failed: ${timedResponse.status}`)
    }

    let body: unknown
    try {
      body = await timedResponse.json()
    }
    catch {
      throw new Error('Invalid Alipay JSON response')
    }

    const root = AlipayResponseRootSchema.safeParse(body)
    const key = `${params.method.replace(/\./g, '_')}_response`
    if (!root.success || 'error_response' in root.data) {
      throw new Error('Invalid Alipay response envelope')
    }

    const response = root.data[key]
    const common = AlipayResponseSchema.safeParse(response)
    if (!common.success) {
      throw new Error('Invalid Alipay response code')
    }
    if (common.data.code !== '10000') {
      // 仅保留有界的渠道错误标识；msg/sub_msg 可能含订单、买家信息，不得透传。
      const subCode = common.data.sub_code
      const suffix = subCode && /^[\w.-]{1,80}$/.test(subCode) ? `, sub_code=${subCode}` : ''
      throw new Error(`Alipay business request failed (code=${common.data.code}${suffix})`)
    }

    const parsed = schema.safeParse(response)
    if (!parsed.success) {
      throw new Error('Invalid Alipay business response')
    }
    return parsed.data
  }

  return {
    name: 'alipay',

    async createOrder(input: CreateOrderInput): Promise<HaiResult<PaymentOrder>> {
      try {
        const { method, productCode } = getTradeConfig(input.tradeType)

        const bizContent = JSON.stringify({
          out_trade_no: input.orderNo,
          total_amount: formatFenAmount(input.amount),
          subject: input.description,
          product_code: productCode,
          passback_params: input.metadata ? JSON.stringify(input.metadata) : undefined,
        })

        const params = {
          ...buildCommonParams(method, input.notifyUrl),
          biz_content: bizContent,
        }

        const data = await alipayRequest(params, AlipayCreateResponseSchema)
        if (data.out_trade_no !== input.orderNo
          || (method === 'alipay.trade.precreate' ? !data.qr_code : !data.trade_no)) {
          throw new Error('Invalid Alipay create response')
        }

        return ok({
          provider: 'alipay',
          tradeType: input.tradeType,
          clientParams: data,
          prepayId: data.trade_no,
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
        const params = parseAlipayNotifyParams(request.body)

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
          amount: parseAlipayAmount(params.total_amount),
          status: statusMap[params.trade_status] ?? 'pending',
          paidAt: params.gmt_payment ? new Date(params.gmt_payment) : undefined,
          // 支付宝回调原始 params 的强类型为 AlipayNotifyParams，此处统一以 Record 暴露给上层做调试/审计
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

        const data = await alipayRequest(params, AlipayQueryResponseSchema)
        if (data.out_trade_no !== orderNo) {
          throw new Error('Alipay response order mismatch')
        }

        const statusMap: Record<string, OrderStatus['status']> = {
          TRADE_SUCCESS: 'paid',
          TRADE_CLOSED: 'closed',
          TRADE_FINISHED: 'paid',
          WAIT_BUYER_PAY: 'pending',
        }

        return ok({
          orderNo,
          transactionId: data.trade_no,
          status: statusMap[data.trade_status],
          amount: parseAlipayAmount(data.total_amount),
          // 支付宝时间为北京时间，不能依赖节点的本地时区解释。
          paidAt: data.send_pay_date ? new Date(`${data.send_pay_date.replace(' ', 'T')}+08:00`) : undefined,
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
            refund_amount: formatFenAmount(input.amount),
            refund_reason: input.reason,
          }),
        }

        const data = await alipayRequest(params, AlipayRefundResponseSchema)
        if (data.out_trade_no !== input.orderNo) {
          throw new Error('Alipay response order mismatch')
        }
        // refund_fee 是累计退款额，只校验安全整数，不与本次退款额直接比较。
        parseAlipayAmount(data.refund_fee)

        return ok({
          refundNo: input.refundNo,
          refundId: data.trade_no,
          status: data.fund_change === 'Y' ? 'success' : 'processing',
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

        const data = await alipayRequest(params, AlipayCloseResponseSchema)
        if (data.out_trade_no !== orderNo) {
          throw new Error('Alipay response order mismatch')
        }
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
