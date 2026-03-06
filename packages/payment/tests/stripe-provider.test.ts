/**
 * @h-ai/payment — stripe-provider（Stripe Provider）单元测试
 *
 * 通过 mock fetch 测试 Stripe Provider 的各项操作。
 */

import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PaymentErrorCode } from '../src/payment-config'
import { createStripeProvider } from '../src/providers/stripe/stripe-provider'

const testConfig = {
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

  beforeEach(() => {
    fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('createOrder', () => {
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
      expect(options.body).toContain('mode=payment')
      expect(options.body).toContain('metadata%5BorderNo%5D=ORD001')
    })

    it('默认币种为 USD', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'cs', url: 'url', payment_intent: 'pi' }),
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
        json: async () => ({ id: 'cs', url: 'url', payment_intent: 'pi' }),
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
        json: async () => ({ id: 'cs', url: 'url', payment_intent: 'pi' }),
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
        expect(result.error.code).toBe(PaymentErrorCode.CREATE_ORDER_FAILED)
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
        expect(result.error.code).toBe(PaymentErrorCode.CREATE_ORDER_FAILED)
      }
    })
  })

  describe('handleNotify', () => {
    it('合法 Webhook 验签通过并解析 checkout.session.completed', async () => {
      const event = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_completed_001',
            metadata: { orderNo: 'ORD001' },
            amount_total: 2000,
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

    it('payment_intent.payment_failed 事件映射为 failed', async () => {
      const event = {
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            id: 'pi_failed_001',
            metadata: { orderNo: 'ORD-FAIL' },
            amount_total: 1000,
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

    it('未知事件类型映射为 pending', async () => {
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

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.status).toBe('pending')
      }
    })

    it('无 metadata.orderNo 时返回空字符串', async () => {
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

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.orderNo).toBe('')
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
        expect(result.error.code).toBe(PaymentErrorCode.NOTIFY_VERIFY_FAILED)
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
        expect(result.error.code).toBe(PaymentErrorCode.NOTIFY_VERIFY_FAILED)
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
        expect(result.error.code).toBe(PaymentErrorCode.NOTIFY_PARSE_FAILED)
      }
    })
  })

  describe('queryOrder', () => {
    it('查询到 session 返回订单状态', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{
            id: 'cs_query_001',
            payment_status: 'paid',
            amount_total: 2000,
          }],
        }),
      })

      const provider = createStripeProvider(testConfig)
      const result = await provider.queryOrder('ORD001')

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.orderNo).toBe('ORD001')
        expect(result.data.transactionId).toBe('cs_query_001')
        expect(result.data.status).toBe('paid')
        expect(result.data.amount).toBe(2000)
      }

      const [url] = fetchSpy.mock.calls[0]
      expect(url).toContain('/checkout/sessions')
      expect(url).toContain('metadata[orderNo]=ORD001')
    })

    it('未找到 session 返回 pending 状态', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      })

      const provider = createStripeProvider(testConfig)
      const result = await provider.queryOrder('ORD-NOT-FOUND')

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.status).toBe('pending')
        expect(result.data.amount).toBe(0)
      }
    })

    it.each([
      ['paid', 'paid'],
      ['unpaid', 'pending'],
      ['no_payment_required', 'paid'],
      ['unknown_status', 'pending'],
    ])('payment_status %s 映射为 %s', async (paymentStatus, expectedStatus) => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: 'cs', payment_status: paymentStatus, amount_total: 100 }],
        }),
      })

      const provider = createStripeProvider(testConfig)
      const result = await provider.queryOrder('ORD-MAP')

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.status).toBe(expectedStatus)
      }
    })

    it('fetch 失败返回 QUERY_ORDER_FAILED', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('timeout'))

      const provider = createStripeProvider(testConfig)
      const result = await provider.queryOrder('ORD-FAIL')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(PaymentErrorCode.QUERY_ORDER_FAILED)
      }
    })
  })

  describe('refund', () => {
    it('退款成功（status=succeeded → success）', async () => {
      // 第一次 fetch：查询 session 获取 payment_intent
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ payment_intent: 'pi_test_001' }],
        }),
      })
      // 第二次 fetch：创建退款
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 're_test_001',
          status: 'succeeded',
        }),
      })

      const provider = createStripeProvider(testConfig)
      const result = await provider.refund({
        orderNo: 'ORD001',
        refundNo: 'RF001',
        amount: 1000,
        reason: '用户退款',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.refundNo).toBe('RF001')
        expect(result.data.refundId).toBe('re_test_001')
        expect(result.data.status).toBe('success')
      }

      // 验证两次 fetch 调用
      expect(fetchSpy).toHaveBeenCalledTimes(2)
      const [refundUrl, refundOptions] = fetchSpy.mock.calls[1]
      expect(refundUrl).toContain('/refunds')
      expect(refundOptions.body).toContain('payment_intent=pi_test_001')
      expect(refundOptions.body).toContain('amount=1000')
    })

    it('退款状态非 succeeded 时返回 processing', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ payment_intent: 'pi_test' }],
        }),
      })
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 're_pending',
          status: 'pending',
        }),
      })

      const provider = createStripeProvider(testConfig)
      const result = await provider.refund({
        orderNo: 'ORD002',
        refundNo: 'RF002',
        amount: 500,
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.status).toBe('processing')
      }
    })

    it('未找到 payment_intent 返回 REFUND_FAILED', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      })

      const provider = createStripeProvider(testConfig)
      const result = await provider.refund({
        orderNo: 'ORD-NO-PI',
        refundNo: 'RF-NO-PI',
        amount: 100,
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(PaymentErrorCode.REFUND_FAILED)
      }
    })

    it('无 reason 时使用默认 requested_by_customer', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ payment_intent: 'pi_test' }],
        }),
      })
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 're', status: 'succeeded' }),
      })

      const provider = createStripeProvider(testConfig)
      await provider.refund({
        orderNo: 'ORD',
        refundNo: 'RF',
        amount: 100,
      })

      const body = fetchSpy.mock.calls[1][1].body as string
      expect(body).toContain('requested_by_customer')
    })

    it('fetch 异常返回 REFUND_FAILED', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('error'))

      const provider = createStripeProvider(testConfig)
      const result = await provider.refund({
        orderNo: 'ORD',
        refundNo: 'RF',
        amount: 100,
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(PaymentErrorCode.REFUND_FAILED)
      }
    })
  })

  describe('closeOrder', () => {
    it('stripe 关闭订单直接返回成功（自动过期）', async () => {
      const provider = createStripeProvider(testConfig)
      const result = await provider.closeOrder('ORD001')

      expect(result.success).toBe(true)
      // 不应发起 fetch 调用
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
