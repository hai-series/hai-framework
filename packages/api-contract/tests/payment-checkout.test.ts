/** Stripe 的公开 API 仅接受已实现的托管 h5 模式。 */
import { describe, expect, it } from 'vitest'
import { PaymentCreateOrderInputSchema } from '../src/payment/payment-schemas'

describe('payment Checkout contract', () => {
  const input = { provider: 'stripe', amount: 100, description: 'Test', tradeType: 'h5' }

  it('接受托管 h5 创建请求', () => {
    expect(PaymentCreateOrderInputSchema.safeParse(input).success).toBe(true)
  })

  it.each(['jsapi', 'app', 'native', 'mini_program'])('拒绝 Stripe %s', (tradeType) => {
    expect(PaymentCreateOrderInputSchema.safeParse({ ...input, tradeType }).success).toBe(false)
  })

  it('拒绝客户端注入未声明的 Checkout 模式', () => {
    expect(PaymentCreateOrderInputSchema.safeParse({ ...input, ui_mode: 'embedded_page' }).success).toBe(false)
  })

  it('保留其它渠道已有的支付场景', () => {
    expect(PaymentCreateOrderInputSchema.safeParse({ ...input, provider: 'wechat', tradeType: 'jsapi' }).success).toBe(true)
  })
})
