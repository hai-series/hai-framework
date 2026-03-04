/**
 * @h-ai/payment — payment-main（模块入口）单元测试
 *
 * 通过 payment.xx 入口测试初始化、Provider 注册与生命周期管理。
 */

import type { PaymentProvider } from '../src/payment-types'
import { ok } from '@h-ai/core'
import { afterEach, describe, expect, it } from 'vitest'
import { payment } from '../src/payment-main'
import { PaymentErrorCode } from '../src/payment-types'

/** 创建 mock Provider */
function createMockProvider(name: string): PaymentProvider {
  return {
    name,
    createOrder: async input => ok({
      provider: name,
      tradeType: input.tradeType,
      clientParams: { mock: true },
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

afterEach(async () => {
  await payment.close()
})

describe('payment.init', () => {
  it('空配置初始化成功（无 Provider）', async () => {
    const result = await payment.init({})
    expect(result.success).toBe(true)
  })

  it('配置 wechat 时注册 wechat Provider', async () => {
    await payment.init({
      wechat: {
        mchId: 'test-mch',
        apiV3Key: 'test-key-32chars-0123456789abcde',
        serialNo: 'test-serial',
        privateKey: 'test-private-key',
        appId: 'test-app-id',
      },
    })

    const provider = payment.getProvider('wechat')
    expect(provider).toBeDefined()
    expect(provider!.name).toBe('wechat')
  })

  it('配置 alipay 时注册 alipay Provider', async () => {
    await payment.init({
      alipay: {
        appId: 'test-alipay-app',
        privateKey: 'test-private-key',
        alipayPublicKey: 'test-public-key',
      },
    })

    const provider = payment.getProvider('alipay')
    expect(provider).toBeDefined()
    expect(provider!.name).toBe('alipay')
  })

  it('配置 stripe 时注册 stripe Provider', async () => {
    await payment.init({
      stripe: {
        secretKey: 'sk_test_xxx',
        webhookSecret: 'whsec_test_xxx',
      },
    })

    const provider = payment.getProvider('stripe')
    expect(provider).toBeDefined()
    expect(provider!.name).toBe('stripe')
  })

  it('同时配置多个 Provider 都能注册', async () => {
    await payment.init({
      wechat: {
        mchId: 'mch',
        apiV3Key: 'key-32-chars-padded-000000000000',
        serialNo: 'sn',
        privateKey: 'pk',
        appId: 'app',
      },
      alipay: {
        appId: 'ali-app',
        privateKey: 'pk',
        alipayPublicKey: 'pub',
      },
      stripe: {
        secretKey: 'sk_test',
        webhookSecret: 'whsec_test',
      },
    })

    expect(payment.getProvider('wechat')).toBeDefined()
    expect(payment.getProvider('alipay')).toBeDefined()
    expect(payment.getProvider('stripe')).toBeDefined()
  })

  it('重复 init 会清除旧 Provider 并重新注册', async () => {
    await payment.init({
      wechat: {
        mchId: 'mch',
        apiV3Key: 'key-32-chars-padded-000000000000',
        serialNo: 'sn',
        privateKey: 'pk',
        appId: 'app',
      },
      alipay: {
        appId: 'ali-app',
        privateKey: 'pk',
        alipayPublicKey: 'pub',
      },
    })
    expect(payment.getProvider('wechat')).toBeDefined()
    expect(payment.getProvider('alipay')).toBeDefined()

    await payment.init({
      stripe: { secretKey: 'sk', webhookSecret: 'ws' },
    })

    expect(payment.getProvider('wechat')).toBeUndefined()
    expect(payment.getProvider('alipay')).toBeUndefined()
    expect(payment.getProvider('stripe')).toBeDefined()
  })
})

describe('payment.close', () => {
  it('close 后所有 Provider 被清除', async () => {
    await payment.init({
      stripe: { secretKey: 'sk', webhookSecret: 'ws' },
    })
    expect(payment.getProvider('stripe')).toBeDefined()

    await payment.close()
    expect(payment.getProvider('stripe')).toBeUndefined()
  })

  it('close 多次不报错', async () => {
    await payment.close()
    await payment.close()
  })
})

describe('payment.registerProvider（手动注册）', () => {
  it('手动注册自定义 Provider', () => {
    payment.registerProvider(createMockProvider('custom'))
    expect(payment.getProvider('custom')).toBeDefined()
    expect(payment.getProvider('custom')!.name).toBe('custom')
  })

  it('相同 name 注册会覆盖前一个', () => {
    const provider1 = createMockProvider('dup')
    const provider2 = createMockProvider('dup')

    payment.registerProvider(provider1)
    payment.registerProvider(provider2)

    expect(payment.getProvider('dup')).toBe(provider2)
  })
})

describe('payment.createOrder（通过入口调用）', () => {
  it('注册 Provider 后可正常创建订单', async () => {
    payment.registerProvider(createMockProvider('mock'))

    const result = await payment.createOrder('mock', {
      orderNo: 'ORD001',
      amount: 100,
      description: '测试商品',
      tradeType: 'jsapi',
      notifyUrl: 'https://example.com/notify',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.provider).toBe('mock')
      expect(result.data.tradeType).toBe('jsapi')
    }
  })

  it('provider 不存在返回 PROVIDER_NOT_FOUND', async () => {
    const result = await payment.createOrder('nonexistent', {
      orderNo: 'ORD002',
      amount: 100,
      description: '测试',
      tradeType: 'h5',
      notifyUrl: 'https://example.com/notify',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(PaymentErrorCode.PROVIDER_NOT_FOUND)
    }
  })
})

describe('payment.handleNotify（通过入口调用）', () => {
  it('注册 Provider 后可处理回调', async () => {
    payment.registerProvider(createMockProvider('mock'))

    const result = await payment.handleNotify('mock', {
      body: '{}',
      headers: {},
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.orderNo).toBe('ORD001')
      expect(result.data.status).toBe('paid')
    }
  })

  it('provider 不存在返回 PROVIDER_NOT_FOUND', async () => {
    const result = await payment.handleNotify('nonexistent', {
      body: '{}',
      headers: {},
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(PaymentErrorCode.PROVIDER_NOT_FOUND)
    }
  })
})

describe('payment.queryOrder（通过入口调用）', () => {
  it('注册 Provider 后可查询订单', async () => {
    payment.registerProvider(createMockProvider('mock'))

    const result = await payment.queryOrder('mock', 'ORD001')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.orderNo).toBe('ORD001')
      expect(result.data.status).toBe('paid')
      expect(result.data.amount).toBe(100)
    }
  })

  it('provider 不存在返回 PROVIDER_NOT_FOUND', async () => {
    const result = await payment.queryOrder('nonexistent', 'ORD001')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(PaymentErrorCode.PROVIDER_NOT_FOUND)
    }
  })
})

describe('payment.refund（通过入口调用）', () => {
  it('注册 Provider 后可正常退款', async () => {
    payment.registerProvider(createMockProvider('mock'))

    const result = await payment.refund('mock', {
      orderNo: 'ORD001',
      refundNo: 'RF001',
      amount: 50,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.refundNo).toBe('RF001')
      expect(result.data.status).toBe('success')
    }
  })

  it('provider 不存在返回 PROVIDER_NOT_FOUND', async () => {
    const result = await payment.refund('nonexistent', {
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

describe('payment.closeOrder（通过入口调用）', () => {
  it('注册 Provider 后可正常关闭订单', async () => {
    payment.registerProvider(createMockProvider('mock'))

    const result = await payment.closeOrder('mock', 'ORD001')
    expect(result.success).toBe(true)
  })

  it('provider 不存在返回 PROVIDER_NOT_FOUND', async () => {
    const result = await payment.closeOrder('nonexistent', 'ORD001')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(PaymentErrorCode.PROVIDER_NOT_FOUND)
    }
  })
})
