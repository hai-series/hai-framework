/** Stripe 托管模式、跳转配置与客户端能力一致性。 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { invokePayment } from '../src/client/payment-client-web'
import { StripeConfigSchema } from '../src/payment-config'
import { HaiPaymentError } from '../src/payment-types'
import { createStripeProvider } from '../src/providers/stripe/stripe-provider'

const config = {
  secretKey: 'sk_test_key',
  webhookSecret: 'whsec_key',
  successUrl: 'https://app.example/payment/success?session_id={CHECKOUT_SESSION_ID}',
}

afterEach(() => vi.unstubAllGlobals())

describe('stripe hosted Checkout', () => {
  it('successUrl 必填，cancelUrl 可省略，保留渠道 Session 占位符', () => {
    const result = StripeConfigSchema.safeParse(config)
    expect(result.success && result.data.successUrl).toBe(config.successUrl)
    expect(StripeConfigSchema.safeParse({ secretKey: config.secretKey, webhookSecret: config.webhookSecret }).success).toBe(false)
  })

  it.each(['javascript:alert(1)', 'file:///tmp/paid', '/payment/success'])('拒绝非 HTTP 跳转地址 %s', (successUrl) => {
    expect(StripeConfigSchema.safeParse({ ...config, successUrl }).success).toBe(false)
    expect(StripeConfigSchema.safeParse({ ...config, cancelUrl: successUrl }).success).toBe(false)
  })

  it('未实现的嵌入模式不能作为未知配置被静默忽略', () => {
    expect(StripeConfigSchema.safeParse({ ...config, uiMode: 'embedded_page' }).success).toBe(false)
  })

  it.each(['jsapi', 'app', 'native', 'mini_program'] as const)('服务端拒绝不支持的 %s 且不请求渠道', async (tradeType) => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const result = await createStripeProvider({ ...config, webhookToleranceSeconds: 300 }).createOrder({
      orderNo: 'ORDER-1',
      amount: 100,
      description: 'Test',
      // @ts-expect-error 刻意验证运行时拒绝已删除的模式。
      tradeType,
      notifyUrl: 'https://app.example/notify',
    })
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiPaymentError.UNSUPPORTED_TRADE_TYPE.code)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('浏览器 h5 调起跳转到服务端返回的托管页', async () => {
    const location = { href: '' }
    vi.stubGlobal('window', { location })
    const result = await invokePayment({ provider: 'stripe', tradeType: 'h5', clientParams: { checkoutUrl: 'https://checkout.stripe.com/pay/cs_test' } })
    expect(result.success && result.data.invoked).toBe(true)
    expect(location.href).toBe('https://checkout.stripe.com/pay/cs_test')
  })

  it('客户端拒绝 app 模式，不假装已调起', async () => {
    const location = { href: '' }
    vi.stubGlobal('window', { location })
    const order = { provider: 'stripe', tradeType: 'h5' as const, clientParams: { checkoutUrl: 'https://checkout.stripe.com/pay/cs_test' } }
    Reflect.set(order, 'tradeType', 'app')
    const result = await invokePayment(order)
    expect(result.success).toBe(false)
    expect(location.href).toBe('')
  })
})
