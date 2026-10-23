/**
 * @h-ai/payment — Stripe Provider
 *
 * 实现 PaymentProvider 接口，对接 Stripe API。
 * 使用 Stripe Checkout Session 模式。
 * @module payment-provider-stripe
 */

import type { HaiResult } from '@h-ai/core'
import type { StripeConfig } from '../../payment-config.js'
import type { CreateOrderInput, OrderStatus, PaymentNotifyRequest, PaymentNotifyResult, PaymentOrder, PaymentProvider, RefundInput, RefundResult } from '../../payment-types.js'
import { createHash, createHmac } from 'node:crypto'
import { core, err, ok } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { z } from 'zod'
import { paymentM } from '../../payment-i18n.js'
import { HaiPaymentError } from '../../payment-types.js'
import { fetchWithTimeout } from '../payment-provider-http.js'
import { getNotifyHeader } from '../payment-provider-notify.js'
import { StripeOperationRepository } from './payment-stripe-repository-operation.js'

/** Stripe API 基地址 */
const STRIPE_API_BASE = 'https://api.stripe.com/v1'
/** 与已核验的 hosted_page 参数契约一致，避免账户默认 API 版本改变协议。 */
const STRIPE_API_VERSION = '2026-09-30.endive'

/** 只持久化继续查单所需的渠道标识和返回给客户端的 Checkout URL。 */
const StripeCreatedSessionSchema = z.object({
  id: z.string().min(1),
  url: z.url(),
  payment_intent: z.string().min(1).nullable().optional(),
})

/** 订单号与首次请求金额/币种绑定；不保存密钥和完整渠道响应。 */
const StripeOrderMappingSchema = z.object({
  orderNo: z.string().min(1),
  amount: z.number().int().positive(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  session: StripeCreatedSessionSchema,
})

/** Session 查询只接受实际有意义的支付状态，并核对其业务身份。 */
const StripeRetrievedSessionSchema = z.object({
  id: z.string().min(1),
  metadata: z.object({ orderNo: z.string().min(1) }),
  amount_total: z.number().int().nonnegative(),
  currency: z.string().regex(/^[a-z]{3}$/i),
  payment_status: z.enum(['paid', 'unpaid', 'no_payment_required']),
  payment_intent: z.string().min(1).nullable(),
  status: z.enum(['open', 'complete', 'expired']),
})

/** 退款受理结果；渠道错误或未知状态不能映射为假成功。 */
const StripeRefundSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['pending', 'requires_action', 'succeeded', 'failed', 'canceled']),
})

/**
 * Stripe Checkout 通知快照；只接受本 Provider 实际消费的 Session 事件。
 *
 * 保留原始扩展字段用于业务核对；不同资源类型不可套用 Session 金额字段。
 */
const StripeCheckoutEventSchema = z.object({
  id: z.string().min(1),
  livemode: z.boolean(),
  // 本 Provider 只支持当前账户，不能消费 Connect/组织上下文的其它商户事件。
  account: z.never().optional(),
  context: z.never().optional(),
  created: z.number().int().nonnegative().max(8_640_000_000_000),
  type: z.enum([
    'checkout.session.completed',
    'checkout.session.async_payment_succeeded',
    'checkout.session.async_payment_failed',
    'checkout.session.expired',
  ]),
  data: z.object({
    object: z.object({
      object: z.literal('checkout.session'),
      id: z.string().min(1),
      mode: z.literal('payment'),
      metadata: z.object({ orderNo: z.string().min(1).regex(/\S/) }).passthrough(),
      amount_total: z.number().int().nonnegative(),
      currency: z.string().regex(/^[a-z]{3}$/i),
      payment_status: z.enum(['paid', 'unpaid', 'no_payment_required']),
    }).passthrough(),
  }).passthrough(),
}).passthrough().refine((event) => {
  const paid = event.data.object.payment_status !== 'unpaid'
  if (event.type === 'checkout.session.async_payment_succeeded')
    return paid
  if (event.type === 'checkout.session.async_payment_failed' || event.type === 'checkout.session.expired')
    return !paid
  return true
}, { message: 'Checkout event type contradicts payment status' })

/**
 * 创建 Stripe Provider
 *
 * @param config - Stripe 配置
 * @param repository - 已初始化的内部渠道操作仓库，由 payment.init 创建。
 * @returns PaymentProvider 实例
 * @internal
 * @example 模块内部上下文
 * ```ts
 * async function createFromTrustedConfig(config: StripeConfig) {
 *   // reldb 已初始化为共享数据库；先等待持久操作表就绪再发布 Provider。
 *   const repository = new StripeOperationRepository(reldb)
 *   const initialized = await repository.initialize()
 *   if (!initialized.success) throw new Error(initialized.error.message)
 *   return createStripeProvider(config, repository)
 * }
 * ```
 */
export function createStripeProvider(
  config: StripeConfig,
  repository = new StripeOperationRepository(reldb),
): PaymentProvider {
  let accountScopePromise: Promise<string> | undefined

  /** Stripe API 请求 */
  async function stripeRequest<T>(method: string, path: string, options?: {
    body?: Record<string, string>
    idempotencyKey?: string
  }): Promise<T> {
    const response = await fetchWithTimeout(`${STRIPE_API_BASE}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${config.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Version': STRIPE_API_VERSION,
        ...(options?.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
      },
      body: options?.body
        ? Object.entries(options.body).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
        : undefined,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Stripe API ${method} ${path} failed: ${response.status} ${errorText}`)
    }

    return response.json() as T
  }

  /** 稳定账户身份与 test/live 隔离；密钥轮换不会改变持久映射命名空间。 */
  async function accountScope(): Promise<string> {
    if (!accountScopePromise) {
      accountScopePromise = (async () => {
        const mode = /^(?:sk|rk)_(test|live)_/.exec(config.secretKey)?.[1]
        if (!mode)
          throw new Error('Stripe requires a test or live secret/restricted API key')
        const account = z.object({ id: z.string().regex(/^acct_/).min(6) }).parse(await stripeRequest('GET', '/account'))
        return `${account.id}:${mode}`
      })().catch((error: unknown) => {
        accountScopePromise = undefined
        throw error
      })
    }
    return accountScopePromise
  }

  /**
   * 按账户、test/live 模式、操作类型和业务标识生成所有节点一致的幂等键。
   * 输出仅包含摘要，不携带明文密钥或业务标识；账户读取失败必须传播，不能临时换键。
   * @param kind - 创建订单、退款或主动关单的操作类型。
   * @param businessId - 持久化的 orderNo 或 refundNo；同一业务操作重试必须保持不变。
   * @returns 适合 Stripe Idempotency-Key 的稳定摘要字符串。
   * @example 模块内部上下文
   * ```ts
   * const first = await operationId('refund', 'REFUND_1')
   * const retry = await operationId('refund', 'REFUND_1')
   * if (first !== retry) throw new Error('Idempotency identity changed')
   * ```
   */
  async function operationId(kind: 'order' | 'refund' | 'close', businessId: string): Promise<string> {
    const digest = createHash('sha256').update(JSON.stringify([await accountScope(), kind, businessId])).digest('hex')
    return `hai-payment-${kind}-${digest}`
  }

  /**
   * 规范化参数并绑定数据库预留；仅对安全窗口内的未知结果沿用同一渠道幂等键请求。
   * 已持久化结果先经结果 Schema 解析后复用；渠道回执或数据库确认缺失时保留预留并失败。
   * @param options - 稳定 ID、固定渠道路径、表单参数及最小结果解析器。
   * @param options.id - 已包含账户、模式与业务标识的稳定操作 ID，复用作渠道幂等键。
   * @param options.path - 当前操作使用的固定 Stripe API 路径。
   * @param options.body - 与首次预留参数一致的渠道表单字段。
   * @param options.resultSchema - 持久化和返回值复用时都必须通过的最小结果 Schema。
   * @param options.execute - 将渠道原始响应转换为经过校验的最小结果，不承担外部履约。
   * @param options.paymentIntent - 从已校验结果提取 PaymentIntent 的可选函数。
   * @returns 经 Schema 校验并由数据库确认的单次操作结果。
   * @throws 参数冲突、过窗未知结果、渠道错误或持久化失败时抛错，由公共操作边界转换。
   * @example 模块内部上下文
   * ```ts
   * async function repeatKnownRefund(refundNo: string, body: Record<string, string>) {
   *   return executeOperation({
   *     id: await operationId('refund', refundNo), path: '/refunds', body,
   *     resultSchema: StripeRefundSchema, execute: raw => StripeRefundSchema.parse(raw),
   *   })
   *   // body 必须与首次预留完全一致；不能借重试更改金额或 PaymentIntent。
   * }
   * ```
   */
  async function executeOperation<T>(options: {
    id: string
    path: string
    body: Record<string, string>
    resultSchema: z.ZodType<T>
    execute: (raw: unknown) => T
    paymentIntent?: (result: T) => string | null | undefined
  }): Promise<T> {
    const requestHash = createHash('sha256').update(JSON.stringify([
      options.path,
      Object.entries(options.body).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0),
    ])).digest('hex')
    const reserved = await repository.reserve(options.id, requestHash)
    if (reserved.result !== null)
      return options.resultSchema.parse(reserved.result)
    if (!reserved.canRetry)
      throw new Error('Stripe operation outcome is unknown beyond the safe retry window; reconcile before retrying')
    const result = options.execute(await stripeRequest('POST', options.path, { body: options.body, idempotencyKey: options.id }))
    return options.resultSchema.parse(await repository.complete(options.id, requestHash, result, options.paymentIntent?.(result)))
  }

  /**
   * 只按持久化 Session ID 查指定订单，核对订单号、金额、币种后原子补全 PaymentIntent。
   * @param orderNo - 由业务持久化、并已经创建过渠道映射的商户订单号。
   * @returns 与本账户/模式/订单映射一致的 Session；不会搜索 metadata 列表猜测订单。
   * @throws 无确认映射、渠道失败、字段非法或身份不一致时抛错，由操作边界转为失败。
   * @example 模块内部上下文
   * ```ts
   * const session = await retrieveOrder('ORDER_1')
   * const canExpire = session.status === 'open' && session.payment_status === 'unpaid'
   * // 只有渠道 expire 后再次确认 expired，才能把关单作为成功结果。
   * ```
   */
  async function retrieveOrder(orderNo: string) {
    const id = await operationId('order', orderNo)
    const operation = await repository.load(id)
    if (!operation || operation.result === null)
      throw new Error('Stripe order has no confirmed persisted Session mapping')
    const mapping = StripeOrderMappingSchema.parse(operation.result)
    const session = StripeRetrievedSessionSchema.parse(await stripeRequest('GET', `/checkout/sessions/${encodeURIComponent(mapping.session.id)}`))
    if (session.id !== mapping.session.id || session.metadata.orderNo !== orderNo
      || mapping.orderNo !== orderNo || session.amount_total !== mapping.amount
      || session.currency.toUpperCase() !== mapping.currency) {
      throw new Error('Stripe Session does not match the persisted order')
    }
    if (session.payment_intent)
      await repository.rememberPaymentIntent(id, session.payment_intent)
    return session
  }

  /** Stripe Webhook 签名容忍时间窗口（秒） */
  const TIMESTAMP_TOLERANCE = config.webhookToleranceSeconds ?? 300

  /**
   * 对原始通知 body 校验唯一时间戳、时间容差及任一有效 v1 签名，支持受信密钥轮换。
   * @param payload - 未重序列化的原始请求体。
   * @param signature - 唯一 Stripe-Signature 头值；重复头由外层拒绝。
   * @returns 签名和时钟同时可信时为 true；不代替 Session 事件、商户身份或持久业务去重。
   * @example 模块内部上下文
   * ```ts
   * function verifyRawBody(body: string, signatureHeader: string): boolean {
   *   return verifyWebhookSignature(body, signatureHeader)
   * }
   * ```
   */
  function verifyWebhookSignature(payload: string, signature: string): boolean {
    const parts = signature.split(',').map(part => part.trim())
    const timestamps = parts.filter(p => p.startsWith('t='))
    if (timestamps.length !== 1)
      return false
    const timestamp = timestamps[0].slice(2)
    const signatures = parts.filter(p => p.startsWith('v1=')).map(p => p.slice(3))

    // 时间戳重放保护
    const ts = Number(timestamp)
    if (!/^(?:0|[1-9]\d{0,11})$/.test(timestamp) || !Number.isSafeInteger(ts)
      || Math.abs(Math.floor(Date.now() / 1000) - ts) > TIMESTAMP_TOLERANCE) {
      return false
    }

    const signedPayload = `${timestamp}.${payload}`
    const expected = createHmac('sha256', config.webhookSecret)
      .update(signedPayload)
      .digest('hex')

    try {
      // Stripe 密钥轮换期间允许同一报文包含多个 v1 签名。
      return signatures.some(v1 => /^[a-f0-9]{64}$/.test(v1) && core.string.constantTimeEqual(v1, expected))
    }
    catch {
      return false
    }
  }

  return {
    name: 'stripe',

    async createOrder(input: CreateOrderInput): Promise<HaiResult<PaymentOrder>> {
      if (input.tradeType !== 'h5')
        return err(HaiPaymentError.UNSUPPORTED_TRADE_TYPE, paymentM('payment_unsupportedTradeType'))
      try {
        z.string().min(1).regex(/\S/).parse(input.orderNo)
        if (input.metadata && Object.hasOwn(input.metadata, 'orderNo'))
          throw new Error('Stripe metadata orderNo is reserved')
        // 使用 Stripe Checkout Session
        const params: Record<string, string> = {
          'mode': 'payment',
          'ui_mode': 'hosted_page',
          'success_url': config.successUrl,
          'line_items[0][price_data][currency]': input.currency?.toLowerCase() ?? 'usd',
          'line_items[0][price_data][product_data][name]': input.description,
          'line_items[0][price_data][unit_amount]': input.amount.toString(),
          'line_items[0][quantity]': '1',
        }
        if (config.cancelUrl)
          params.cancel_url = config.cancelUrl

        // metadata 传递订单号
        params['metadata[orderNo]'] = input.orderNo
        if (input.metadata) {
          for (const [k, v] of Object.entries(input.metadata)) {
            params[`metadata[${k}]`] = v
          }
        }

        const mapping = await executeOperation({
          id: await operationId('order', input.orderNo),
          path: '/checkout/sessions',
          body: params,
          resultSchema: StripeOrderMappingSchema,
          execute: raw => ({
            orderNo: input.orderNo,
            amount: input.amount,
            currency: input.currency?.toUpperCase() ?? 'USD',
            session: StripeCreatedSessionSchema.parse(raw),
          }),
          paymentIntent: result => result.session.payment_intent,
        })

        return ok({
          provider: 'stripe',
          tradeType: input.tradeType,
          clientParams: {
            sessionId: mapping.session.id,
            checkoutUrl: mapping.session.url,
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
        const signature = getNotifyHeader(request.headers, 'stripe-signature') ?? ''

        // 验签
        const valid = verifyWebhookSignature(request.body, signature)
        if (!valid) {
          return err(
            HaiPaymentError.NOTIFY_VERIFY_FAILED,
            paymentM('payment_notifyVerifyFailed'),
          )
        }

        const parsed = StripeCheckoutEventSchema.safeParse(JSON.parse(request.body))
        if (!parsed.success)
          throw new Error('Invalid Stripe payment event')
        const event = parsed.data
        if (event.livemode !== /^(?:sk|rk)_live_/.test(config.secretKey)
          || event.created > Math.floor(Date.now() / 1000) + TIMESTAMP_TOLERANCE) {
          return err(HaiPaymentError.NOTIFY_VERIFY_FAILED, paymentM('payment_notifyVerifyFailed'))
        }
        const obj = event.data.object
        // completed 只表示 Checkout 已完成；延迟付款仍可能处于 unpaid。
        const status: PaymentNotifyResult['status'] = event.type === 'checkout.session.expired'
          ? 'closed'
          : event.type === 'checkout.session.async_payment_failed'
            ? 'failed'
            : obj.payment_status === 'unpaid' ? 'pending' : 'paid'

        return ok({
          orderNo: obj.metadata.orderNo,
          transactionId: obj.id,
          eventId: event.id,
          amount: obj.amount_total,
          currency: obj.currency.toUpperCase(),
          status,
          // 使用支付成功事件的时间，使重复通知不会改变 paidAt；pending/failed/closed 不宣称已支付。
          paidAt: status === 'paid' ? new Date(event.created * 1000) : undefined,
          raw: event,
        })
      }
      catch {
        return err(
          HaiPaymentError.NOTIFY_PARSE_FAILED,
          paymentM('payment_notifyParseFailed'),
          new Error('Invalid Stripe payment notification'),
        )
      }
    },

    async queryOrder(orderNo: string): Promise<HaiResult<OrderStatus>> {
      try {
        const session = await retrieveOrder(orderNo)

        const statusMap: Record<string, OrderStatus['status']> = {
          paid: 'paid',
          unpaid: 'pending',
          no_payment_required: 'paid',
        }

        return ok({
          orderNo,
          transactionId: session.id,
          status: session.status === 'expired' ? 'closed' : statusMap[session.payment_status],
          amount: session.amount_total,
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
        z.string().min(1).regex(/\S/).parse(input.refundNo)
        const session = await retrieveOrder(input.orderNo)
        if (!session.payment_intent || session.payment_status !== 'paid') {
          return err(
            HaiPaymentError.REFUND_FAILED,
            paymentM('payment_refundFailed'),
          )
        }

        const body: Record<string, string> = {
          'payment_intent': session.payment_intent,
          'amount': input.amount.toString(),
          'reason': 'requested_by_customer',
          'metadata[orderNo]': input.orderNo,
          'metadata[refundNo]': input.refundNo,
        }
        if (input.reason)
          body['metadata[reason]'] = input.reason
        const refund = await executeOperation({
          id: await operationId('refund', input.refundNo),
          path: '/refunds',
          body,
          resultSchema: StripeRefundSchema,
          execute: raw => StripeRefundSchema.parse(raw),
        })

        return ok({
          refundNo: input.refundNo,
          refundId: refund.id,
          status: refund.status === 'succeeded' ? 'success' : refund.status === 'failed' || refund.status === 'canceled' ? 'failed' : 'processing',
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
        const session = await retrieveOrder(orderNo)
        if (session.payment_status !== 'unpaid' || session.status === 'complete')
          throw new Error('A completed or paid Stripe Session cannot be closed')
        if (session.status === 'expired')
          return ok(undefined)

        try {
          const expired = z.object({ id: z.string(), status: z.literal('expired') }).parse(
            await stripeRequest('POST', `/checkout/sessions/${encodeURIComponent(session.id)}/expire`, {
              body: {},
              idempotencyKey: await operationId('close', orderNo),
            }),
          )
          if (expired.id !== session.id)
            throw new Error('Stripe expiration response does not match the requested Session')
        }
        catch (cause) {
          // 其它节点已关单或响应丢失时，仅在重新读取并确认 expired 后返回幂等成功。
          const confirmed = await retrieveOrder(orderNo)
          if (confirmed.status !== 'expired' || confirmed.payment_status !== 'unpaid')
            throw cause
        }
        return ok(undefined)
      }
      catch (cause) {
        return err(HaiPaymentError.CLOSE_ORDER_FAILED, paymentM('payment_closeOrderFailed'), cause)
      }
    },
  }
}
