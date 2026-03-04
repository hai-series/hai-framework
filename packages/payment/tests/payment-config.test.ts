/**
 * @h-ai/payment — payment-config（Zod Schema）单元测试
 *
 * 验证各支付渠道与顶层配置 Schema 的校验、默认值与边界行为。
 */

import { describe, expect, it } from 'vitest'
import {
  AlipayConfigSchema,
  PaymentConfigSchema,
  StripeConfigSchema,
  WechatPayConfigSchema,
} from '../src/payment-config'

describe('wechatPayConfigSchema', () => {
  it('完整有效配置通过校验', () => {
    const result = WechatPayConfigSchema.safeParse({
      mchId: 'mch001',
      apiV3Key: 'key-32-chars-padded-000000000000',
      serialNo: 'serial-no-001',
      privateKey: '-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----',
      appId: 'wx1234567890',
    })
    expect(result.success).toBe(true)
  })

  it('platformCert 为可选字段', () => {
    const withCert = WechatPayConfigSchema.safeParse({
      mchId: 'mch001',
      apiV3Key: 'k',
      serialNo: 'sn',
      privateKey: 'pk',
      appId: 'app',
      platformCert: 'cert-pem',
    })
    expect(withCert.success).toBe(true)

    const withoutCert = WechatPayConfigSchema.safeParse({
      mchId: 'mch001',
      apiV3Key: 'k',
      serialNo: 'sn',
      privateKey: 'pk',
      appId: 'app',
    })
    expect(withoutCert.success).toBe(true)
  })

  it('缺少必填字段 mchId 校验失败', () => {
    const result = WechatPayConfigSchema.safeParse({
      apiV3Key: 'k',
      serialNo: 'sn',
      privateKey: 'pk',
      appId: 'app',
    })
    expect(result.success).toBe(false)
  })

  it('空字符串 mchId 校验失败', () => {
    const result = WechatPayConfigSchema.safeParse({
      mchId: '',
      apiV3Key: 'k',
      serialNo: 'sn',
      privateKey: 'pk',
      appId: 'app',
    })
    expect(result.success).toBe(false)
  })

  it('缺少 apiV3Key 校验失败', () => {
    const result = WechatPayConfigSchema.safeParse({
      mchId: 'mch',
      serialNo: 'sn',
      privateKey: 'pk',
      appId: 'app',
    })
    expect(result.success).toBe(false)
  })

  it('缺少 appId 校验失败', () => {
    const result = WechatPayConfigSchema.safeParse({
      mchId: 'mch',
      apiV3Key: 'k',
      serialNo: 'sn',
      privateKey: 'pk',
    })
    expect(result.success).toBe(false)
  })
})

describe('alipayConfigSchema', () => {
  it('完整有效配置通过校验并带默认值', () => {
    const result = AlipayConfigSchema.safeParse({
      appId: 'ali-app-001',
      privateKey: 'pk',
      alipayPublicKey: 'pub',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.signType).toBe('RSA2')
      expect(result.data.sandbox).toBe(false)
    }
  })

  it('指定 signType=RSA 覆盖默认值', () => {
    const result = AlipayConfigSchema.safeParse({
      appId: 'ali-app',
      privateKey: 'pk',
      alipayPublicKey: 'pub',
      signType: 'RSA',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.signType).toBe('RSA')
    }
  })

  it('指定 sandbox=true', () => {
    const result = AlipayConfigSchema.safeParse({
      appId: 'ali-app',
      privateKey: 'pk',
      alipayPublicKey: 'pub',
      sandbox: true,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.sandbox).toBe(true)
    }
  })

  it('无效 signType 校验失败', () => {
    const result = AlipayConfigSchema.safeParse({
      appId: 'ali-app',
      privateKey: 'pk',
      alipayPublicKey: 'pub',
      signType: 'MD5',
    })
    expect(result.success).toBe(false)
  })

  it('缺少 appId 校验失败', () => {
    const result = AlipayConfigSchema.safeParse({
      privateKey: 'pk',
      alipayPublicKey: 'pub',
    })
    expect(result.success).toBe(false)
  })

  it('缺少 privateKey 校验失败', () => {
    const result = AlipayConfigSchema.safeParse({
      appId: 'ali-app',
      alipayPublicKey: 'pub',
    })
    expect(result.success).toBe(false)
  })

  it('空字符串 alipayPublicKey 校验失败', () => {
    const result = AlipayConfigSchema.safeParse({
      appId: 'ali-app',
      privateKey: 'pk',
      alipayPublicKey: '',
    })
    expect(result.success).toBe(false)
  })
})

describe('stripeConfigSchema', () => {
  it('完整有效配置通过校验', () => {
    const result = StripeConfigSchema.safeParse({
      secretKey: 'sk_test_abc123',
      webhookSecret: 'whsec_abc123',
    })
    expect(result.success).toBe(true)
  })

  it('缺少 secretKey 校验失败', () => {
    const result = StripeConfigSchema.safeParse({
      webhookSecret: 'whsec_abc',
    })
    expect(result.success).toBe(false)
  })

  it('缺少 webhookSecret 校验失败', () => {
    const result = StripeConfigSchema.safeParse({
      secretKey: 'sk_test',
    })
    expect(result.success).toBe(false)
  })

  it('空字符串 secretKey 校验失败', () => {
    const result = StripeConfigSchema.safeParse({
      secretKey: '',
      webhookSecret: 'whsec',
    })
    expect(result.success).toBe(false)
  })
})

describe('paymentConfigSchema（顶层）', () => {
  it('空对象通过校验（所有子配置可选）', () => {
    const result = PaymentConfigSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('只配置一个渠道通过校验', () => {
    const result = PaymentConfigSchema.safeParse({
      stripe: { secretKey: 'sk', webhookSecret: 'ws' },
    })
    expect(result.success).toBe(true)
  })

  it('完整三渠道配置通过校验', () => {
    const result = PaymentConfigSchema.safeParse({
      wechat: {
        mchId: 'mch',
        apiV3Key: 'key',
        serialNo: 'sn',
        privateKey: 'pk',
        appId: 'app',
      },
      alipay: {
        appId: 'ali',
        privateKey: 'pk',
        alipayPublicKey: 'pub',
      },
      stripe: {
        secretKey: 'sk',
        webhookSecret: 'ws',
      },
    })
    expect(result.success).toBe(true)
  })

  it('子配置不合法导致顶层失败', () => {
    const result = PaymentConfigSchema.safeParse({
      wechat: { mchId: '' },
    })
    expect(result.success).toBe(false)
  })

  it('子配置为空对象导致顶层失败', () => {
    const result = PaymentConfigSchema.safeParse({
      alipay: {},
    })
    expect(result.success).toBe(false)
  })
})
