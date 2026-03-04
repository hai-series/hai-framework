/**
 * @h-ai/payment — payment-api-contract（API 契约 Schema）单元测试
 *
 * 测试各 API 端点的 Zod Schema 校验与 Endpoint 定义完整性。
 */

import { describe, expect, it } from 'vitest'
import {
  CreatePaymentOrderInputSchema,
  CreatePaymentOrderOutputSchema,
  paymentEndpoints,
  QueryOrderOutputSchema,
  RefundInputSchema,
  RefundOutputSchema,
} from '../src/api/payment-api-contract'

describe('createPaymentOrderInputSchema', () => {
  const validInput = {
    provider: 'wechat',
    amount: 100,
    description: '测试商品',
    tradeType: 'jsapi',
  }

  it('合法入参校验通过', () => {
    const result = CreatePaymentOrderInputSchema.safeParse(validInput)
    expect(result.success).toBe(true)
  })

  it('provider 只能是 wechat/alipay/stripe', () => {
    const result = CreatePaymentOrderInputSchema.safeParse({
      ...validInput,
      provider: 'unknown',
    })
    expect(result.success).toBe(false)
  })

  it.each(['wechat', 'alipay', 'stripe'])('provider=%s 校验通过', (provider) => {
    const result = CreatePaymentOrderInputSchema.safeParse({ ...validInput, provider })
    expect(result.success).toBe(true)
  })

  it('amount 必须是正整数', () => {
    expect(CreatePaymentOrderInputSchema.safeParse({ ...validInput, amount: 0 }).success).toBe(false)
    expect(CreatePaymentOrderInputSchema.safeParse({ ...validInput, amount: -1 }).success).toBe(false)
    expect(CreatePaymentOrderInputSchema.safeParse({ ...validInput, amount: 1.5 }).success).toBe(false)
  })

  it('description 不能为空', () => {
    const result = CreatePaymentOrderInputSchema.safeParse({
      ...validInput,
      description: '',
    })
    expect(result.success).toBe(false)
  })

  it.each(['jsapi', 'h5', 'app', 'native', 'mini_program'])('tradeType=%s 校验通过', (tradeType) => {
    const result = CreatePaymentOrderInputSchema.safeParse({ ...validInput, tradeType })
    expect(result.success).toBe(true)
  })

  it('tradeType 不合法时校验失败', () => {
    const result = CreatePaymentOrderInputSchema.safeParse({
      ...validInput,
      tradeType: 'invalid',
    })
    expect(result.success).toBe(false)
  })

  it('userId 是可选字段', () => {
    const withUserId = CreatePaymentOrderInputSchema.safeParse({
      ...validInput,
      userId: 'openid-xxx',
    })
    expect(withUserId.success).toBe(true)

    const withoutUserId = CreatePaymentOrderInputSchema.safeParse(validInput)
    expect(withoutUserId.success).toBe(true)
  })

  it('metadata 是可选的 Record<string, string>', () => {
    const withMeta = CreatePaymentOrderInputSchema.safeParse({
      ...validInput,
      metadata: { key1: 'val1', key2: 'val2' },
    })
    expect(withMeta.success).toBe(true)

    const withoutMeta = CreatePaymentOrderInputSchema.safeParse(validInput)
    expect(withoutMeta.success).toBe(true)
  })

  it('缺少必填字段时校验失败', () => {
    expect(CreatePaymentOrderInputSchema.safeParse({}).success).toBe(false)
    expect(CreatePaymentOrderInputSchema.safeParse({ provider: 'wechat' }).success).toBe(false)
    expect(CreatePaymentOrderInputSchema.safeParse({ provider: 'wechat', amount: 1 }).success).toBe(false)
  })
})

describe('createPaymentOrderOutputSchema', () => {
  it('合法出参校验通过', () => {
    const result = CreatePaymentOrderOutputSchema.safeParse({
      provider: 'wechat',
      tradeType: 'jsapi',
      clientParams: { appId: 'wx123', paySign: 'abc' },
      prepayId: 'wx_prepay_001',
    })
    expect(result.success).toBe(true)
  })

  it('prepayId 是可选字段', () => {
    const result = CreatePaymentOrderOutputSchema.safeParse({
      provider: 'stripe',
      tradeType: 'h5',
      clientParams: { checkoutUrl: 'https://...' },
    })
    expect(result.success).toBe(true)
  })

  it('clientParams 可包含任意值', () => {
    const result = CreatePaymentOrderOutputSchema.safeParse({
      provider: 'test',
      tradeType: 'app',
      clientParams: { nested: { deep: true }, num: 42, arr: [1, 2] },
    })
    expect(result.success).toBe(true)
  })
})

describe('queryOrderOutputSchema', () => {
  it('合法出参校验通过', () => {
    const result = QueryOrderOutputSchema.safeParse({
      orderNo: 'ORD001',
      status: 'paid',
      amount: 100,
      transactionId: 'TXN001',
      paidAt: '2024-01-01T12:00:00Z',
    })
    expect(result.success).toBe(true)
  })

  it.each(['pending', 'paid', 'closed', 'refunded', 'failed'])('status=%s 校验通过', (status) => {
    const result = QueryOrderOutputSchema.safeParse({
      orderNo: 'ORD',
      status,
      amount: 100,
    })
    expect(result.success).toBe(true)
  })

  it('status 不合法时校验失败', () => {
    const result = QueryOrderOutputSchema.safeParse({
      orderNo: 'ORD',
      status: 'cancelled',
      amount: 100,
    })
    expect(result.success).toBe(false)
  })

  it('transactionId 和 paidAt 是可选', () => {
    const result = QueryOrderOutputSchema.safeParse({
      orderNo: 'ORD',
      status: 'pending',
      amount: 0,
    })
    expect(result.success).toBe(true)
  })
})

describe('refundInputSchema', () => {
  const validInput = {
    provider: 'wechat',
    orderNo: 'ORD001',
    refundNo: 'RF001',
    amount: 50,
  }

  it('合法入参校验通过', () => {
    const result = RefundInputSchema.safeParse(validInput)
    expect(result.success).toBe(true)
  })

  it('amount 必须是正整数', () => {
    expect(RefundInputSchema.safeParse({ ...validInput, amount: 0 }).success).toBe(false)
    expect(RefundInputSchema.safeParse({ ...validInput, amount: -1 }).success).toBe(false)
    expect(RefundInputSchema.safeParse({ ...validInput, amount: 1.5 }).success).toBe(false)
  })

  it('reason 是可选字段', () => {
    const withReason = RefundInputSchema.safeParse({ ...validInput, reason: '不想要了' })
    expect(withReason.success).toBe(true)

    const withoutReason = RefundInputSchema.safeParse(validInput)
    expect(withoutReason.success).toBe(true)
  })

  it('缺少必填字段校验失败', () => {
    const { refundNo: _, ...noRefundNo } = validInput
    expect(RefundInputSchema.safeParse(noRefundNo).success).toBe(false)
  })
})

describe('refundOutputSchema', () => {
  it('合法出参校验通过', () => {
    const result = RefundOutputSchema.safeParse({
      refundNo: 'RF001',
      refundId: 're_test_001',
      status: 'success',
    })
    expect(result.success).toBe(true)
  })

  it.each(['processing', 'success', 'failed'])('status=%s 校验通过', (status) => {
    const result = RefundOutputSchema.safeParse({
      refundNo: 'RF',
      refundId: 're',
      status,
    })
    expect(result.success).toBe(true)
  })

  it('status 不合法时校验失败', () => {
    const result = RefundOutputSchema.safeParse({
      refundNo: 'RF',
      refundId: 're',
      status: 'cancelled',
    })
    expect(result.success).toBe(false)
  })
})

describe('paymentEndpoints（端点契约完整性）', () => {
  it('包含 6 个端点', () => {
    const keys = Object.keys(paymentEndpoints)
    expect(keys).toEqual([
      'createOrder',
      'queryOrder',
      'notifyWechat',
      'notifyAlipay',
      'notifyStripe',
      'refund',
    ])
  })

  it.each([
    ['createOrder', 'POST', '/payment/create', true],
    ['queryOrder', 'GET', '/payment/query', true],
    ['notifyWechat', 'POST', '/payment/notify/wechat', false],
    ['notifyAlipay', 'POST', '/payment/notify/alipay', false],
    ['notifyStripe', 'POST', '/payment/notify/stripe', false],
    ['refund', 'POST', '/payment/refund', true],
  ] as const)('%s: method=%s path=%s requireAuth=%s', (name, method, path, requireAuth) => {
    const endpoint = paymentEndpoints[name]
    expect(endpoint.method).toBe(method)
    expect(endpoint.path).toBe(path)
    expect(endpoint.requireAuth).toBe(requireAuth)
  })

  it('每个端点都有 input 和 output Schema', () => {
    for (const key of Object.keys(paymentEndpoints) as Array<keyof typeof paymentEndpoints>) {
      const endpoint = paymentEndpoints[key]
      expect(endpoint.input).toBeDefined()
      expect(endpoint.output).toBeDefined()
      expect(typeof endpoint.input.safeParse).toBe('function')
      expect(typeof endpoint.output.safeParse).toBe('function')
    }
  })

  it('每个端点都有 meta.tags 包含 payment', () => {
    for (const key of Object.keys(paymentEndpoints) as Array<keyof typeof paymentEndpoints>) {
      const endpoint = paymentEndpoints[key]
      expect(endpoint.meta?.tags).toContain('payment')
    }
  })

  it('回调端点不需要认证', () => {
    expect(paymentEndpoints.notifyWechat.requireAuth).toBe(false)
    expect(paymentEndpoints.notifyAlipay.requireAuth).toBe(false)
    expect(paymentEndpoints.notifyStripe.requireAuth).toBe(false)
  })

  it('createOrder 端点 input/output 可正确校验', () => {
    const inputResult = paymentEndpoints.createOrder.input.safeParse({
      provider: 'wechat',
      amount: 100,
      description: 'test',
      tradeType: 'jsapi',
    })
    expect(inputResult.success).toBe(true)

    const outputResult = paymentEndpoints.createOrder.output.safeParse({
      provider: 'wechat',
      tradeType: 'jsapi',
      clientParams: {},
    })
    expect(outputResult.success).toBe(true)
  })
})
