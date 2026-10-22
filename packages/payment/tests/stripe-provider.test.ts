/**
 * @h-ai/payment — stripe-provider（Stripe Provider）单元测试
 *
 * 通过 mock fetch 测试 Stripe Provider 的各项操作。
 */

import { createHmac } from 'node:crypto'
import { reldb } from '@h-ai/reldb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HaiPaymentError } from '../src/payment-types'
import { StripeOperationRepository } from '../src/providers/stripe/stripe-operation-repository'
import { createStripeProvider } from '../src/providers/stripe/stripe-provider'

const testConfig = {
  successUrl: 'https://example.invalid/payment/success',
  secretKey: 'sk_test_4eC39HqLyjWDarjtT1zdp7dc',
  webhookSecret: 'whsec_test_secret_key_001',
}

/** 辅助：生成 Stripe Webhook 签名 */
function generateStripeSignature(payload: string, secret: string, timestamp?: string): string {
  const ts = timestamp ?? Math.floor(Date.now() / 1000).toString()
  const signedPayload = `${ts}.${payload}`
  const v1 = createHmac('sha256', secret).update(signedPayload).digest('hex')
  return `t=${ts},v1=${v1}`
}

describe('stripe-provider', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    const initialized = await reldb.init({ type: 'sqlite', database: ':memory:' })
    if (!initialized.success)
      throw new Error(initialized.error.message)
    const ready = await new StripeOperationRepository(reldb).initialize()
    if (!ready.success)
      throw new Error(ready.error.message)
    fetchSpy = vi.fn()
    vi.stubGlobal('fetch', (url: string, options: RequestInit) => {
      if (url.endsWith('/v1/account'))
        return Promise.resolve(Response.json({ id: 'acct_test_001' }))
      return fetchSpy(url, options)
    })
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    await reldb.close()
  })

  describe('createOrder', () => {
    it('可选取消跳转地址由可信服务端配置传给渠道', async () => {
      fetchSpy.mockResolvedValueOnce(Response.json({ id: 'cs_cancel', url: 'https://checkout.stripe.com/pay/cs_cancel' }))
      const result = await createStripeProvider({ ...testConfig, webhookToleranceSeconds: 300, cancelUrl: 'https://app.example/payment/cancel' }).createOrder({
        orderNo: 'ORDER-CANCEL',
        amount: 100,
        description: 'Test',
        tradeType: 'h5',
        notifyUrl: 'https://app.example/notify',
      })
      expect(result.success).toBe(true)
      expect(new URLSearchParams(fetchSpy.mock.calls[0][1].body).get('cancel_url')).toBe('https://app.example/payment/cancel')
    })

    it('checkout Session 下单成功', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'cs_test_001',
          url: 'https://checkout.stripe.com/pay/cs_test_001',
          payment_intent: 'pi_test_001',
        }),
      })

      const provider = createStripeProvider(testConfig)
      const result = await provider.createOrder({
        orderNo: 'ORD001',
        amount: 2000, // 20 USD
        description: 'Premium Plan',
        tradeType: 'h5',
        notifyUrl: 'https://example.com/notify',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.provider).toBe('stripe')
        expect(result.data.tradeType).toBe('h5')
        expect(result.data.clientParams.sessionId).toBe('cs_test_001')
        expect(result.data.clientParams.checkoutUrl).toContain('checkout.stripe.com')
      }

      // 验证 fetch 调用
      const [url, options] = fetchSpy.mock.calls[0]
      expect(url).toContain('/checkout/sessions')
      expect(options.method).toBe('POST')
      expect(options.headers.Authorization).toBe(`Bearer ${testConfig.secretKey}`)
      expect(options.headers['Stripe-Version']).toBe('2026-09-30.endive')
      const form = new URLSearchParams(options.body)
      expect(form.get('ui_mode')).toBe('hosted_page')
      expect(form.get('success_url')).toBe(testConfig.successUrl)
      expect(options.body).toContain('mode=payment')
      expect(options.body).toContain('metadata%5BorderNo%5D=ORD001')
      expect(options.signal).toBeDefined()
    })

    it('默认币种为 USD', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'cs', url: 'https://checkout.stripe.com/pay/cs', payment_intent: 'pi' }),
      })

      const provider = createStripeProvider(testConfig)
      await provider.createOrder({
        orderNo: 'ORD-USD',
        amount: 100,
        description: 'Default currency',
        tradeType: 'h5',
        notifyUrl: 'https://example.com/notify',
      })

      const body = fetchSpy.mock.calls[0][1].body as string
      expect(body).toContain('usd')
    })

    it('指定币种 CNY', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'cs', url: 'https://checkout.stripe.com/pay/cs', payment_intent: 'pi' }),
      })

      const provider = createStripeProvider(testConfig)
      await provider.createOrder({
        orderNo: 'ORD-CNY',
        amount: 100,
        description: 'CNY order',
        tradeType: 'h5',
        currency: 'CNY',
        notifyUrl: 'https://example.com/notify',
      })

      const body = fetchSpy.mock.calls[0][1].body as string
      expect(body).toContain('cny')
    })

    it('metadata 传递到 Stripe', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'cs', url: 'https://checkout.stripe.com/pay/cs', payment_intent: 'pi' }),
      })

      const provider = createStripeProvider(testConfig)
      await provider.createOrder({
        orderNo: 'ORD-META',
        amount: 100,
        description: 'With metadata',
        tradeType: 'h5',
        notifyUrl: 'https://example.com/notify',
        metadata: { source: 'web', campaign: 'summer' },
      })

      const body = fetchSpy.mock.calls[0][1].body as string
      expect(body).toContain('metadata%5Bsource%5D=web')
      expect(body).toContain('metadata%5Bcampaign%5D=summer')
    })

    it('fetch 失败返回 CREATE_ORDER_FAILED', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 402,
        text: async () => '{"error":{"message":"Card declined"}}',
      })

      const provider = createStripeProvider(testConfig)
      const result = await provider.createOrder({
        orderNo: 'ORD-FAIL',
        amount: 100,
        description: '失败测试',
        tradeType: 'h5',
        notifyUrl: 'https://example.com/notify',
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiPaymentError.CREATE_ORDER_FAILED.code)
      }
    })

    it('网络异常返回 CREATE_ORDER_FAILED', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('Network error'))

      const provider = createStripeProvider(testConfig)
      const result = await provider.createOrder({
        orderNo: 'ORD-NET',
        amount: 100,
        description: '网络异常',
        tradeType: 'h5',
        notifyUrl: 'https://example.com/notify',
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiPaymentError.CREATE_ORDER_FAILED.code)
      }
    })
  })

  describe('handleNotify', () => {
    it('合法 Webhook 验签通过并解析 checkout.session.completed', async () => {
      const event = {
        id: 'evt_completed_001',
        created: 1_700_000_000,
        type: 'checkout.session.completed',
        data: {
          object: {
            object: 'checkout.session',
            mode: 'payment',
            id: 'cs_completed_001',
            metadata: { orderNo: 'ORD001' },
            amount_total: 2000,
            currency: 'usd',
            payment_status: 'paid',
          },
        },
      }
      const payload = JSON.stringify(event)
      const signature = generateStripeSignature(payload, testConfig.webhookSecret)

      const provider = createStripeProvider(testConfig)
      const result = await provider.handleNotify({
        body: payload,
        headers: { 'stripe-signature': signature },
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.orderNo).toBe('ORD001')
        expect(result.data.transactionId).toBe('cs_completed_001')
        expect(result.data.amount).toBe(2000)
        expect(result.data.status).toBe('paid')
        expect(result.data.paidAt).toBeInstanceOf(Date)
      }
    })

    it('checkout.session.async_payment_failed 事件映射为 failed', async () => {
      const event = {
        id: 'evt_failed_001',
        created: 1_700_000_000,
        type: 'checkout.session.async_payment_failed',
        data: {
          object: {
            object: 'checkout.session',
            mode: 'payment',
            id: 'cs_failed_001',
            metadata: { orderNo: 'ORD-FAIL' },
            amount_total: 1000,
            currency: 'usd',
            payment_status: 'unpaid',
          },
        },
      }
      const payload = JSON.stringify(event)
      const signature = generateStripeSignature(payload, testConfig.webhookSecret)

      const provider = createStripeProvider(testConfig)
      const result = await provider.handleNotify({
        body: payload,
        headers: { 'stripe-signature': signature },
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.status).toBe('failed')
      }
    })

    it('未知事件类型返回 NOTIFY_PARSE_FAILED', async () => {
      const event = {
        type: 'charge.succeeded',
        data: {
          object: {
            id: 'ch_001',
            metadata: { orderNo: 'ORD-UNKNOWN' },
            amount_total: 500,
          },
        },
      }
      const payload = JSON.stringify(event)
      const signature = generateStripeSignature(payload, testConfig.webhookSecret)

      const provider = createStripeProvider(testConfig)
      const result = await provider.handleNotify({
        body: payload,
        headers: { 'stripe-signature': signature },
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiPaymentError.NOTIFY_PARSE_FAILED.code)
      }
    })

    it('无 metadata.orderNo 时拒绝通知', async () => {
      const event = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_no_meta',
            amount_total: 100,
          },
        },
      }
      const payload = JSON.stringify(event)
      const signature = generateStripeSignature(payload, testConfig.webhookSecret)

      const provider = createStripeProvider(testConfig)
      const result = await provider.handleNotify({
        body: payload,
        headers: { 'stripe-signature': signature },
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiPaymentError.NOTIFY_PARSE_FAILED.code)
      }
    })

    it('签名不匹配返回 NOTIFY_VERIFY_FAILED', async () => {
      const event = { type: 'test', data: { object: { id: 'x' } } }
      const payload = JSON.stringify(event)

      const provider = createStripeProvider(testConfig)
      const result = await provider.handleNotify({
        body: payload,
        headers: { 'stripe-signature': 't=1000,v1=invalidsig' },
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiPaymentError.NOTIFY_VERIFY_FAILED.code)
      }
    })

    it('缺少 stripe-signature header 验签失败', async () => {
      const provider = createStripeProvider(testConfig)
      const result = await provider.handleNotify({
        body: '{}',
        headers: {},
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiPaymentError.NOTIFY_VERIFY_FAILED.code)
      }
    })

    it('无效 JSON body 返回 NOTIFY_PARSE_FAILED', async () => {
      // 先让验签通过
      const payload = 'not-json'
      const signature = generateStripeSignature(payload, testConfig.webhookSecret)

      const provider = createStripeProvider(testConfig)
      const result = await provider.handleNotify({
        body: payload,
        headers: { 'stripe-signature': signature },
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiPaymentError.NOTIFY_PARSE_FAILED.code)
      }
    })

    it('可通过 webhookToleranceSeconds 放宽验签时间窗口', async () => {
      const event = {
        id: 'evt_old_sig',
        created: 1_700_000_000,
        type: 'checkout.session.completed',
        data: {
          object: {
            object: 'checkout.session',
            mode: 'payment',
            id: 'cs_old_sig',
            metadata: { orderNo: 'ORD-TOLERANCE' },
            amount_total: 500,
            currency: 'usd',
            payment_status: 'paid',
          },
        },
      }
      const payload = JSON.stringify(event)
      const oldTimestamp = (Math.floor(Date.now() / 1000) - 500).toString()
      const signature = generateStripeSignature(payload, testConfig.webhookSecret, oldTimestamp)

      const provider = createStripeProvider({
        ...testConfig,
        webhookToleranceSeconds: 600,
      })
      const result = await provider.handleNotify({
        body: payload,
        headers: { 'stripe-signature': signature },
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.orderNo).toBe('ORD-TOLERANCE')
      }
    })
  })

  describe('queryOrder/refund 的可信持久映射', () => {
    it('未知订单查单失败，禁止用列表首项猜测', async () => {
      const result = await createStripeProvider(testConfig).queryOrder('ORD-NOT-FOUND')
      expect(result.success).toBe(false)
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('未知订单退款失败且不发送退款请求', async () => {
      const result = await createStripeProvider(testConfig).refund({ orderNo: 'ORD-NOT-FOUND', refundNo: 'RF001', amount: 100 })
      expect(result.success).toBe(false)
      expect(fetchSpy).not.toHaveBeenCalled()
    })
  })
  describe('closeOrder', () => {
    it('stripe 未知订单不能伪装关闭成功', async () => {
      const provider = createStripeProvider(testConfig)
      const result = await provider.closeOrder('ORD001')

      expect(result.success).toBe(false)
      // 没有持久渠道映射时不调用任意 Session。
      expect(fetchSpy).not.toHaveBeenCalled()
    })
  })

  describe('provider.name', () => {
    it('name 为 stripe', () => {
      const provider = createStripeProvider(testConfig)
      expect(provider.name).toBe('stripe')
    })
  })
})
