/**
 * @h-ai/payment — payment-functions 单元测试
 *
 * 覆盖 Provider 注册表、路由逻辑与各操作的正常/边界路径。
 */

import type { PaymentProvider } from '../src/payment-types'
import { err, ok } from '@h-ai/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PaymentErrorCode } from '../src/payment-config'
import {
  clearProviders,
  closeOrder,
  createOrder,
  getProvider,
  handleNotify,
  queryOrder,
  refund,
  registerProvider,
} from '../src/payment-functions'

// mock @h-ai/audit 模块，使 payment-functions 内部的 audit.log 可被断言
const mockAuditLog = vi.fn(async () => ok(undefined as never))
vi.mock('@h-ai/audit', () => ({
  audit: {
    init: vi.fn(),
    close: vi.fn(),
    isInitialized: true,
    log: mockAuditLog,
    list: vi.fn(),
    getUserRecent: vi.fn(),
    cleanup: vi.fn(),
    getStats: vi.fn(),
    helper: {},
  },
}))

/** 创建 mock Provider */
function createMockProvider(name: string): PaymentProvider {
  return {
    name,
    createOrder: async input => ok({
      provider: name,
      tradeType: input.tradeType,
      clientParams: { mockKey: 'mockValue' },
      prepayId: 'mock-prepay-id',
    }),
    handleNotify: async () => ok({
      orderNo: 'ORD001',
      transactionId: 'TXN001',
      amount: 100,
      status: 'paid' as const,
    }),
    queryOrder: async orderNo => ok({
      orderNo,
      status: 'paid' as const,
      amount: 100,
    }),
    refund: async input => ok({
      refundNo: input.refundNo,
      refundId: 'REF001',
      status: 'success' as const,
    }),
    closeOrder: async () => ok(undefined),
  }
}

describe('payment-functions', () => {
  it('registerProvider 注册后可通过 getProvider 获取', () => {
    clearProviders()
    const provider = createMockProvider('test')
    registerProvider(provider)
    expect(getProvider('test')).toBe(provider)
  })

  it('getProvider 不存在时返回 undefined', () => {
    clearProviders()
    expect(getProvider('nonexistent')).toBeUndefined()
  })

  it('createOrder 使用已注册 Provider 成功', async () => {
    clearProviders()
    registerProvider(createMockProvider('mock'))

    const result = await createOrder('mock', {
      orderNo: 'ORD001',
      amount: 100,
      description: '测试',
      tradeType: 'jsapi',
      notifyUrl: 'https://example.com/notify',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.provider).toBe('mock')
      expect(result.data.clientParams).toEqual({ mockKey: 'mockValue' })
    }
  })

  it('createOrder 未注册 Provider 返回 PROVIDER_NOT_FOUND', async () => {
    clearProviders()

    const result = await createOrder('unknown', {
      orderNo: 'ORD002',
      amount: 100,
      description: '测试',
      tradeType: 'jsapi',
      notifyUrl: 'https://example.com/notify',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(PaymentErrorCode.PROVIDER_NOT_FOUND)
    }
  })

  it('queryOrder 可正常查询', async () => {
    clearProviders()
    registerProvider(createMockProvider('mock'))

    const result = await queryOrder('mock', 'ORD001')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.orderNo).toBe('ORD001')
      expect(result.data.status).toBe('paid')
    }
  })

  it('closeOrder 可正常关闭', async () => {
    clearProviders()
    registerProvider(createMockProvider('mock'))

    const result = await closeOrder('mock', 'ORD001')
    expect(result.success).toBe(true)
  })

  it('clearProviders 清空后 getProvider 返回 undefined', () => {
    registerProvider(createMockProvider('temp'))
    expect(getProvider('temp')).toBeDefined()
    clearProviders()
    expect(getProvider('temp')).toBeUndefined()
  })
})

// ─── 补充测试：handleNotify、refund 及多 Provider 场景 ───

afterEach(() => {
  clearProviders()
  mockAuditLog.mockClear()
})

describe('payment-functions — handleNotify', () => {
  it('handleNotify 使用已注册 Provider 成功', async () => {
    registerProvider(createMockProvider('mock'))

    const result = await handleNotify('mock', {
      body: '{}',
      headers: {},
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.orderNo).toBe('ORD001')
      expect(result.data.transactionId).toBe('TXN001')
      expect(result.data.amount).toBe(100)
      expect(result.data.status).toBe('paid')
    }
  })

  it('handleNotify 未注册 Provider 返回 PROVIDER_NOT_FOUND', async () => {
    const result = await handleNotify('unknown', {
      body: '{}',
      headers: {},
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(PaymentErrorCode.PROVIDER_NOT_FOUND)
    }
  })
})

describe('payment-functions — refund', () => {
  it('refund 使用已注册 Provider 成功', async () => {
    registerProvider(createMockProvider('mock'))

    const result = await refund('mock', {
      orderNo: 'ORD001',
      refundNo: 'RF001',
      amount: 50,
      reason: '退换货',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.refundNo).toBe('RF001')
      expect(result.data.refundId).toBe('REF001')
      expect(result.data.status).toBe('success')
    }
  })

  it('refund 未注册 Provider 返回 PROVIDER_NOT_FOUND', async () => {
    const result = await refund('unknown', {
      orderNo: 'ORD001',
      refundNo: 'RF001',
      amount: 50,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(PaymentErrorCode.PROVIDER_NOT_FOUND)
    }
  })
})

describe('payment-functions — 多 Provider 路由', () => {
  it('多个 Provider 注册后各自独立工作', async () => {
    registerProvider(createMockProvider('wechat'))
    registerProvider(createMockProvider('alipay'))
    registerProvider(createMockProvider('stripe'))

    const r1 = await createOrder('wechat', {
      orderNo: 'W001',
      amount: 100,
      description: '微信',
      tradeType: 'jsapi',
      notifyUrl: 'https://x.com/n',
    })
    const r2 = await createOrder('alipay', {
      orderNo: 'A001',
      amount: 200,
      description: '支付宝',
      tradeType: 'h5',
      notifyUrl: 'https://x.com/n',
    })
    const r3 = await createOrder('stripe', {
      orderNo: 'S001',
      amount: 300,
      description: 'Stripe',
      tradeType: 'h5',
      notifyUrl: 'https://x.com/n',
    })

    expect(r1.success).toBe(true)
    expect(r2.success).toBe(true)
    expect(r3.success).toBe(true)

    if (r1.success)
      expect(r1.data.provider).toBe('wechat')
    if (r2.success)
      expect(r2.data.provider).toBe('alipay')
    if (r3.success)
      expect(r3.data.provider).toBe('stripe')
  })

  it('注册同名 Provider 会覆盖前一个', () => {
    const p1 = createMockProvider('dup')
    const p2 = createMockProvider('dup')

    registerProvider(p1)
    expect(getProvider('dup')).toBe(p1)

    registerProvider(p2)
    expect(getProvider('dup')).toBe(p2)
  })

  it('queryOrder / closeOrder 未注册也返回 PROVIDER_NOT_FOUND', async () => {
    const qr = await queryOrder('ghost', 'ORD')
    expect(qr.success).toBe(false)
    if (!qr.success)
      expect(qr.error.code).toBe(PaymentErrorCode.PROVIDER_NOT_FOUND)

    const cr = await closeOrder('ghost', 'ORD')
    expect(cr.success).toBe(false)
    if (!cr.success)
      expect(cr.error.code).toBe(PaymentErrorCode.PROVIDER_NOT_FOUND)
  })
})

describe('payment-functions — Provider 返回错误的透传', () => {
  it('provider createOrder 返回 err 时原样透传', async () => {
    const failingProvider: PaymentProvider = {
      name: 'fail',
      createOrder: async () => err({
        code: PaymentErrorCode.INVALID_AMOUNT,
        message: '金额无效',
      }),
      handleNotify: async () => err({ code: PaymentErrorCode.NOTIFY_PARSE_FAILED, message: '' }),
      queryOrder: async () => err({ code: PaymentErrorCode.QUERY_ORDER_FAILED, message: '' }),
      refund: async () => err({ code: PaymentErrorCode.REFUND_FAILED, message: '' }),
      closeOrder: async () => err({ code: PaymentErrorCode.CLOSE_ORDER_FAILED, message: '' }),
    }
    registerProvider(failingProvider)

    const result = await createOrder('fail', {
      orderNo: 'ORD',
      amount: -1,
      description: '非法',
      tradeType: 'jsapi',
      notifyUrl: 'https://x.com/n',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(PaymentErrorCode.INVALID_AMOUNT)
    }
  })
})

// ─── 审计日志集成测试（通过 vi.mock 拦截 @h-ai/audit） ───

describe('payment-functions — 审计日志', () => {
  afterEach(() => {
    mockAuditLog.mockClear()
  })

  it('createOrder 成功后写审计日志', async () => {
    registerProvider(createMockProvider('mock'))

    const result = await createOrder('mock', {
      orderNo: 'ORD001',
      amount: 100,
      description: '测试',
      tradeType: 'jsapi',
      notifyUrl: 'https://example.com/notify',
    })

    expect(result.success).toBe(true)
    expect(mockAuditLog).toHaveBeenCalledOnce()
    expect(mockAuditLog).toHaveBeenCalledWith({
      action: 'create_order',
      resource: 'payment',
      resourceId: 'ORD001',
      details: { provider: 'mock', amount: 100, tradeType: 'jsapi' },
    })
  })

  it('handleNotify 成功后写审计日志', async () => {
    registerProvider(createMockProvider('mock'))

    const result = await handleNotify('mock', { body: '{}', headers: {} })

    expect(result.success).toBe(true)
    expect(mockAuditLog).toHaveBeenCalledOnce()
    expect(mockAuditLog).toHaveBeenCalledWith({
      action: 'payment_notify',
      resource: 'payment',
      resourceId: 'ORD001',
      details: { provider: 'mock', transactionId: 'TXN001', status: 'paid', amount: 100 },
    })
  })

  it('refund 成功后写审计日志', async () => {
    registerProvider(createMockProvider('mock'))

    const result = await refund('mock', {
      orderNo: 'ORD001',
      refundNo: 'RF001',
      amount: 50,
    })

    expect(result.success).toBe(true)
    expect(mockAuditLog).toHaveBeenCalledOnce()
    expect(mockAuditLog).toHaveBeenCalledWith({
      action: 'refund',
      resource: 'payment',
      resourceId: 'ORD001',
      details: { provider: 'mock', refundNo: 'RF001', amount: 50 },
    })
  })

  it('closeOrder 成功后写审计日志', async () => {
    registerProvider(createMockProvider('mock'))

    const result = await closeOrder('mock', 'ORD001')

    expect(result.success).toBe(true)
    expect(mockAuditLog).toHaveBeenCalledOnce()
    expect(mockAuditLog).toHaveBeenCalledWith({
      action: 'close_order',
      resource: 'payment',
      resourceId: 'ORD001',
      details: { provider: 'mock' },
    })
  })

  it('操作失败时不写审计日志', async () => {
    // Provider 未注册，操作失败
    const result = await createOrder('nonexistent', {
      orderNo: 'ORD',
      amount: 100,
      description: '测试',
      tradeType: 'jsapi',
      notifyUrl: 'https://example.com/n',
    })

    expect(result.success).toBe(false)
    expect(mockAuditLog).not.toHaveBeenCalled()
  })

  it('审计日志写入失败不影响支付操作结果', async () => {
    registerProvider(createMockProvider('mock'))
    mockAuditLog.mockResolvedValueOnce(err({ code: 10000, message: 'audit write failed' }) as never)

    const result = await createOrder('mock', {
      orderNo: 'ORD001',
      amount: 100,
      description: '测试',
      tradeType: 'jsapi',
      notifyUrl: 'https://example.com/n',
    })

    expect(result.success).toBe(true)
    expect(mockAuditLog).toHaveBeenCalledOnce()
  })

  it('queryOrder 不写审计日志（读操作）', async () => {
    registerProvider(createMockProvider('mock'))

    const result = await queryOrder('mock', 'ORD001')

    expect(result.success).toBe(true)
    expect(mockAuditLog).not.toHaveBeenCalled()
  })
})
