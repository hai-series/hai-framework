/**
 * @h-ai/payment — 支付宝 Provider
 *
 * 实现 PaymentProvider 接口，对接支付宝 Open API。
 * @module payment-provider-alipay
 */

import type { HaiResult } from '@h-ai/core'
import type { ZodType } from 'zod'
import type { AlipayConfig } from '../../payment-config.js'
import type { CreateOrderInput, OrderStatus, PaymentNotifyRequest, PaymentNotifyResult, PaymentOrder, PaymentProvider, RefundInput, RefundResult } from '../../payment-types.js'
import type { AlipayNotifyParams } from './payment-alipay-types.js'
import { err, ok } from '@h-ai/core'
import { paymentM } from '../../payment-i18n.js'
import { HaiPaymentError } from '../../payment-types.js'
import { fetchWithTimeout } from '../payment-provider-http.js'
import { signAlipayParams, verifyAlipayNotify } from './payment-alipay-sign.js'
import { formatAlipayTime, parseAlipayTime } from './payment-alipay-time.js'
import { AlipayCloseResponseSchema, AlipayNotifyParamsSchema, AlipayQueryResponseSchema, AlipayRefundResponseSchema, AlipayResponseRootSchema, AlipayResponseSchema } from './payment-alipay-types.js'

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
  const params = new URLSearchParams(body)
  if (new Set(params.keys()).size !== [...params].length)
    throw new Error('Ambiguous Alipay notification parameters')
  const parseResult = AlipayNotifyParamsSchema.safeParse(Object.fromEntries(params.entries()))
  if (!parseResult.success) {
    throw new Error('Invalid Alipay notification parameters')
  }

  return parseResult.data
}

/**
 * 创建支付宝 Provider
 *
 * @param config - 支付宝配置
 * @returns PaymentProvider 实例
 * @internal
 * @example 模块内部上下文
 * ```ts
 * function createFromTrustedConfig(config: AlipayConfig) {
 *   // 配置已经由渠道 Schema 解析；真实密钥、商户身份与通知端点由部署提供。
 *   const provider = createAlipayProvider(config)
 *   const name = provider.name // 'alipay'
 *   return provider
 * }
 * ```
 */
export function createAlipayProvider(config: AlipayConfig): PaymentProvider {
  const gateway = config.sandbox ? ALIPAY_SANDBOX_GATEWAY : ALIPAY_GATEWAY
  const signType = config.signType ?? 'RSA2'

  /**
   * 由受信商户配置构建公共参数，时间固定按 Asia/Shanghai，不依赖节点 TZ。
   * @param method - 当前操作对应的支付宝固定方法名。
   * @param notifyUrl - 服务端配置的通知端点；不从任意客户端字段直接信任。
   * @returns 尚未包含 sign/biz_content 的公共协议字段；签名后只能作为 POST 表单发送。
   * @example 模块内部上下文
   * ```ts
   * const params = buildCommonParams('alipay.trade.wap.pay', 'https://api.example.com/payment/notify/alipay')
   * const beijingTimestamp = params.timestamp
   * // 页面支付随后补 return_url/biz_content 并签名，不请求服务端 JSON envelope。
   * ```
   */
  function buildCommonParams(method: string, notifyUrl: string): Record<string, string> {
    return {
      app_id: config.appId,
      method,
      format: 'JSON',
      charset: 'utf-8',
      sign_type: signType,
      timestamp: formatAlipayTime(new Date()),
      version: '1.0',
      notify_url: notifyUrl,
    }
  }

  /**
   * 发送请求并核验对应方法的业务响应，再解析操作所需字段。
   *
   * HTTP 200 不代表业务成功；禁止把错误对象、原始响应或 Zod 输入放入 cause。
   * @param params - 已固定 method 和 biz_content 的未签名公共参数。
   * @param schema - 对应该方法所需字段的响应 Schema。
   * @returns HTTP、方法 envelope、10000 业务码与字段校验均通过的结果。
   * @throws 超时、网络、业务码或字段校验失败时抛错，由对应公共操作转为 HaiResult。
   * @example 模块内部上下文
   * ```ts
   * async function closeKnownOrder(orderNo: string) {
   *   const params = {
   *     ...buildCommonParams('alipay.trade.close', ''),
   *     biz_content: JSON.stringify({ out_trade_no: orderNo }),
   *   }
   *   const response = await alipayRequest(params, AlipayCloseResponseSchema)
   *   if (response.out_trade_no !== orderNo) throw new Error('Order identity mismatch')
   *   return response
   * }
   * ```
   */
  async function alipayRequest<T>(params: Record<string, string>, schema: ZodType<T>): Promise<T> {
    const sign = signAlipayParams(params, config.privateKey, signType)
    const allParams = { ...params, sign }

    const timedResponse = await fetchWithTimeout(gateway, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(allParams).toString(),
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
      if (input.tradeType !== 'h5')
        return err(HaiPaymentError.UNSUPPORTED_TRADE_TYPE, paymentM('payment_unsupportedTradeType'))
      if (input.currency !== undefined && input.currency !== 'CNY')
        return err(HaiPaymentError.INVALID_INPUT, paymentM('payment_invalidCreateOrderInput'))
      try {
        // WAP 是页面支付 API：离线签名后由浏览器 POST，不能当作服务端 JSON 请求。
        const fields = {
          ...buildCommonParams('alipay.trade.wap.pay', input.notifyUrl),
          return_url: config.returnUrl,
          biz_content: JSON.stringify({
            out_trade_no: input.orderNo,
            total_amount: formatFenAmount(input.amount),
            subject: input.description,
            product_code: 'QUICK_WAP_WAY',
            passback_params: input.metadata ? encodeURIComponent(JSON.stringify(input.metadata)) : undefined,
          }),
        }
        return ok({
          provider: 'alipay',
          tradeType: 'h5',
          clientParams: {
            gateway,
            fields: { ...fields, sign: signAlipayParams(fields, config.privateKey, signType) },
          },
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
        const valid = params.sign_type === signType && verifyAlipayNotify(params, config.alipayPublicKey)
        if (!valid) {
          return err(
            HaiPaymentError.NOTIFY_VERIFY_FAILED,
            paymentM('payment_notifyVerifyFailed'),
          )
        }
        if (params.app_id !== config.appId || params.seller_id !== config.sellerId) {
          return err(HaiPaymentError.NOTIFY_VERIFY_FAILED, paymentM('payment_notifyVerifyFailed'))
        }
        // 允许渠道跨日重试；重放靠持久 eventId 和订单状态 CAS，不套用微信的五分钟窗口。
        const notifiedAt = parseAlipayTime(params.notify_time)!
        const paidAt = params.gmt_payment ? parseAlipayTime(params.gmt_payment) : undefined
        if (notifiedAt.getTime() > Date.now() + 300_000
          || (paidAt && paidAt.getTime() > notifiedAt.getTime() + 300_000)) {
          throw new Error('Invalid Alipay notification time')
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
          eventId: params.notify_id,
          amount: parseAlipayAmount(params.total_amount),
          currency: 'CNY',
          status: statusMap[params.trade_status],
          paidAt: ['TRADE_SUCCESS', 'TRADE_FINISHED'].includes(params.trade_status) ? paidAt : undefined,
          raw: params,
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
          paidAt: data.send_pay_date ? parseAlipayTime(data.send_pay_date) : undefined,
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
