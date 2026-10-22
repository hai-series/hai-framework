/** Stripe 的公开 API 仅接受已实现的托管 h5 模式。 */
import { describe, expect, it } from 'vitest'
import { PaymentCreateOrderDataSchema, PaymentCreateOrderInputSchema } from '../src/payment/payment-schemas'

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
    expect(PaymentCreateOrderInputSchema.safeParse({ ...input, provider: 'wechat', tradeType: 'jsapi', userId: 'trusted-openid' }).success).toBe(true)
  })
})

// 与浏览器实现一致的完整模式矩阵，输出也不能接受未实现的组合。
describe('built-in payment trade matrix', () => {
  it.each([
    ['wechat', 'jsapi', true],
    ['wechat', 'h5', false],
    ['alipay', 'h5', true],
    ['alipay', 'jsapi', false],
    ['stripe', 'h5', true],
    ['stripe', 'jsapi', false],
    ['wechat', 'app', false],
    ['alipay', 'native', false],
    ['alipay', 'mini_program', false],
  ])('%s/%s allowed=%s', (provider, tradeType, allowed) => {
    expect(PaymentCreateOrderInputSchema.safeParse({ provider, tradeType, amount: 100, description: '商品', userId: 'openid-test' }).success).toBe(allowed)
    expect(PaymentCreateOrderDataSchema.safeParse({ provider, tradeType, clientParams: {} }).success).toBe(allowed)
  })

  it.each([undefined, '', '  '])('微信缺少有效 openid=%s 时拒绝', (userId) => {
    expect(PaymentCreateOrderInputSchema.safeParse({ provider: 'wechat', tradeType: 'jsapi', amount: 100, description: '商品', userId }).success).toBe(false)
  })
})
