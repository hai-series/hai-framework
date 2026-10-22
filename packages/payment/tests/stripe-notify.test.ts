/** Stripe Checkout 通知状态与边界回归。 */
import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { HaiPaymentError } from '../src/payment-types'
import { createStripeProvider } from '../src/providers/stripe/stripe-provider'

const config = { secretKey: 'test-only-api-key', webhookSecret: 'test-only-webhook-key' }

/** 构造与 Stripe Checkout Session 快照一致的通知。 */
function createEvent(type = 'checkout.session.completed', paymentStatus = 'paid') {
  return {
    id: 'evt_checkout_001',
    created: 1_700_000_000,
    type,
    data: {
      object: {
        object: 'checkout.session',
        mode: 'payment',
        id: 'cs_checkout_001',
        metadata: { orderNo: 'ORD001' },
        amount_total: 2000,
        currency: 'usd',
        payment_status: paymentStatus,
      },
    },
  }
}

/** 仅为测试签署原始 body，事件 created 不替代签名时间。 */
async function notify(event: unknown) {
  const body = JSON.stringify(event)
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = createHmac('sha256', config.webhookSecret).update(`${timestamp}.${body}`).digest('hex')
  return createStripeProvider(config).handleNotify({
    body,
    headers: { 'stripe-signature': `t=${timestamp},v1=${signature}` },
  })
}

describe('stripe Checkout notifications', () => {
  it.each([
    ['checkout.session.completed', 'unpaid', 'pending'],
    ['checkout.session.completed', 'paid', 'paid'],
    ['checkout.session.completed', 'no_payment_required', 'paid'],
    ['checkout.session.async_payment_succeeded', 'paid', 'paid'],
    ['checkout.session.async_payment_failed', 'unpaid', 'failed'],
    ['checkout.session.expired', 'unpaid', 'closed'],
  ])('%s / %s 返回 %s', async (type, paymentStatus, expectedStatus) => {
    const event = createEvent(type, paymentStatus)
    const result = await notify(event)
    expect(result.success).toBe(true)
    if (!result.success)
      return
    expect(result.data).toMatchObject({
      orderNo: 'ORD001',
      transactionId: 'cs_checkout_001',
      amount: 2000,
      status: expectedStatus,
      eventId: event.id,
      currency: 'USD',
    })
    expect(result.data.paidAt).toEqual(expectedStatus === 'paid' ? new Date(event.created * 1000) : undefined)
  })

  it('异步成功事件与未支付状态矛盾时拒绝', async () => {
    const result = await notify(createEvent('checkout.session.async_payment_succeeded', 'unpaid'))
    expect(result.success).toBe(false)
  })

  it('相同事件在不同实例重复解析保留事件身份和时间', async () => {
    const event = createEvent()
    const [first, second] = await Promise.all([notify(event), notify(event)])
    expect(first).toEqual(second)
  })

  it.each(['charge.succeeded', 'payment_intent.payment_failed'])('拒绝非 Checkout 事件 %s', async (type) => {
    const result = await notify(createEvent(type))
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiPaymentError.NOTIFY_PARSE_FAILED.code)
  })

  it.each([
    { field: 'metadata', value: {} },
    { field: 'amount_total', value: -1 },
    { field: 'amount_total', value: 0.5 },
    { field: 'amount_total', value: null },
    { field: 'currency', value: '' },
    { field: 'payment_status', value: 'unknown' },
    { field: 'object', value: 'payment_intent' },
  ])('拒绝非法 $field=$value', async ({ field, value }) => {
    const event = createEvent()
    const result = await notify({ ...event, data: { object: { ...event.data.object, [field]: value } } })
    expect(result.success).toBe(false)
  })

  it('拒绝缺少事件身份和时间的通知', async () => {
    const event = createEvent()
    const result = await notify({ ...event, id: '', created: undefined })
    expect(result.success).toBe(false)
  })
})
