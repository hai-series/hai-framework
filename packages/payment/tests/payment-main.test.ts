/**
 * @h-ai/payment — payment-main（模块入口）单元测试
 *
 * 通过 payment.xx 入口测试初始化、Provider 注册与生命周期管理。
 */

import type { PaymentProvider } from '../src/payment-types'
import { err, HaiCommonError, ok } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { payment } from '../src/payment-main'
import { HaiPaymentError } from '../src/payment-types'

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
      eventId: 'evt_mock_001',
      currency: 'CNY',
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

beforeEach(async () => {
  const initialized = await reldb.init({ type: 'sqlite', database: ':memory:' })
  if (!initialized.success)
    throw new Error(initialized.error.message)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await payment.close()
  await reldb.close()
})

describe('payment.init', () => {
  it('空配置初始化成功（无 Provider）', async () => {
    const result = await payment.init({})
    expect(result.success).toBe(true)
  })

  it('并发 init 时第二次返回 CONFIG_ERROR', async () => {
    // 先初始化一次，使后续 init 进入 reinit 路径（会 await close()，产生微任务让步）
    await payment.init({})

    const [r1, r2] = await Promise.all([
      payment.init({}),
      payment.init({}),
    ])

    // 其中一个成功，另一个因并发被拒绝
    const results = [r1, r2]
    const successes = results.filter(r => r.success)
    const failures = results.filter(r => !r.success)

    expect(successes).toHaveLength(1)
    expect(failures).toHaveLength(1)
    if (!failures[0].success) {
      expect(failures[0].error.code).toBe(HaiPaymentError.CONFIG_ERROR.code)
    }
  })

  it('配置 wechat 时注册 wechat Provider', async () => {
    await payment.init({
      wechat: {
        mchId: 'test-mch',
        apiV3Key: 'test-key-32chars-0123456789abcde',
        serialNo: 'test-serial',
        platformKeys: { PUB_KEY_ID_TEST: 'platform-pem' },
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
        sellerId: '2088_test',
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
        successUrl: 'https://example.invalid/payment/success',
        secretKey: 'sk_test_xxx',
        webhookSecret: 'whsec_test_xxx',
      },
    })

    const provider = payment.getProvider('stripe')
    expect(provider).toBeDefined()
    expect(provider!.name).toBe('stripe')
  })

  it('stripe 未初始化数据库时拒绝初始化，且不发布任何 Provider', async () => {
    await reldb.close()
    const result = await payment.init({ stripe: { successUrl: 'https://example.invalid/payment/success', secretKey: 'sk_test_key', webhookSecret: 'whsec_key' } })
    expect(result.success).toBe(false)
    expect(payment.isInitialized).toBe(false)
    expect(payment.getProvider('stripe')).toBeUndefined()
  })

  it('stripe 建表失败时拒绝初始化', async () => {
    vi.spyOn(reldb.ddl, 'createTable').mockResolvedValueOnce(err(HaiCommonError.INTERNAL_ERROR, 'test DDL failure'))
    const result = await payment.init({ stripe: { successUrl: 'https://example.invalid/payment/success', secretKey: 'sk_test_key', webhookSecret: 'whsec_key' } })
    expect(result.success).toBe(false)
    expect(payment.isInitialized).toBe(false)
    expect(payment.getProvider('stripe')).toBeUndefined()
  })

  it('同时配置多个 Provider 都能注册', async () => {
    await payment.init({
      wechat: {
        mchId: 'mch',
        apiV3Key: 'key-32-chars-padded-000000000000',
        serialNo: 'sn',
        platformKeys: { PUB_KEY_ID_TEST: 'platform-pem' },
        privateKey: 'pk',
        appId: 'app',
      },
      alipay: {
        appId: 'ali-app',
        privateKey: 'pk',
        sellerId: '2088_test',
        alipayPublicKey: 'pub',
      },
      stripe: {
        successUrl: 'https://example.invalid/payment/success',
        secretKey: 'sk_test_key',
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
        platformKeys: { PUB_KEY_ID_TEST: 'platform-pem' },
        privateKey: 'pk',
        appId: 'app',
      },
      alipay: {
        appId: 'ali-app',
        privateKey: 'pk',
        sellerId: '2088_test',
        alipayPublicKey: 'pub',
      },
    })
    expect(payment.getProvider('wechat')).toBeDefined()
    expect(payment.getProvider('alipay')).toBeDefined()

    await payment.init({
      stripe: { successUrl: 'https://example.invalid/payment/success', secretKey: 'sk_test_key', webhookSecret: 'ws' },
    })

    expect(payment.getProvider('wechat')).toBeUndefined()
    expect(payment.getProvider('alipay')).toBeUndefined()
    expect(payment.getProvider('stripe')).toBeDefined()
  })
})

describe('payment.close', () => {
  it('close 后所有 Provider 被清除', async () => {
    await payment.init({
      stripe: { successUrl: 'https://example.invalid/payment/success', secretKey: 'sk_test_key', webhookSecret: 'ws' },
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
    await payment.init({})
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
    await payment.init({})
    const result = await payment.createOrder('nonexistent', {
      orderNo: 'ORD002',
      amount: 100,
      description: '测试',
      tradeType: 'h5',
      notifyUrl: 'https://example.com/notify',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiPaymentError.PROVIDER_NOT_FOUND.code)
    }
  })
})

describe('payment.handleNotify（通过入口调用）', () => {
  it('注册 Provider 后可处理回调', async () => {
    await payment.init({})
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
    await payment.init({})
    const result = await payment.handleNotify('nonexistent', {
      body: '{}',
      headers: {},
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiPaymentError.PROVIDER_NOT_FOUND.code)
    }
  })
})

describe('payment.queryOrder（通过入口调用）', () => {
  it('注册 Provider 后可查询订单', async () => {
    await payment.init({})
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
    await payment.init({})
    const result = await payment.queryOrder('nonexistent', 'ORD001')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiPaymentError.PROVIDER_NOT_FOUND.code)
    }
  })
})

describe('payment.refund（通过入口调用）', () => {
  it('注册 Provider 后可正常退款', async () => {
    await payment.init({})
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
    await payment.init({})
    const result = await payment.refund('nonexistent', {
      orderNo: 'ORD001',
      refundNo: 'RF001',
      amount: 50,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiPaymentError.PROVIDER_NOT_FOUND.code)
    }
  })
})

describe('payment.closeOrder（通过入口调用）', () => {
  it('注册 Provider 后可正常关闭订单', async () => {
    await payment.init({})
    payment.registerProvider(createMockProvider('mock'))

    const result = await payment.closeOrder('mock', 'ORD001')
    expect(result.success).toBe(true)
  })

  it('provider 不存在返回 PROVIDER_NOT_FOUND', async () => {
    await payment.init({})
    const result = await payment.closeOrder('nonexistent', 'ORD001')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiPaymentError.PROVIDER_NOT_FOUND.code)
    }
  })
})
