/**
 * @h-ai/payment — payment-provider-wechat（微信支付 Provider）单元测试
 *
 * 通过 mock fetch 测试微信支付 Provider 的各项操作。
 */

import { Buffer } from 'node:buffer'
import { createCipheriv, createSign, generateKeyPairSync } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HaiPaymentError } from '../src/payment-types'
import { createWechatPayProvider } from '../src/providers/wechat/payment-provider-wechat'

// 生成测试用 RSA 密钥对
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})

const testConfig = {
  mchId: 'test-mch-001',
  platformKeys: { PUB_KEY_ID_TEST: publicKey },
  apiV3Key: 'a]1234567890abcdef1234567890abcd', // 32字节
  serialNo: 'TEST-SERIAL-001',
  privateKey,
  appId: 'wx-test-app-001',
}

/** 辅助：AES-256-GCM 加密（模拟微信回调资源加密） */
function encryptNotifyResource(plaintext: string, nonce: string, associatedData: string, key: string): string {
  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  cipher.setAAD(Buffer.from(associatedData))
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([encrypted, authTag]).toString('base64')
}

/** 辅助：模拟微信平台签名回调 body */
function signNotifyPayload(timestamp: string, nonce: string, body: string, key: string): string {
  const sign = createSign('RSA-SHA256')
  sign.update(`${timestamp}\n${nonce}\n${body}\n`)
  return sign.sign(key, 'base64')
}

/** 按平台公钥 ID 选择验签密钥的测试配置。 */
const testConfigWithCert = { ...testConfig }

describe('payment-provider-wechat', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('createOrder', () => {
    it('jSAPI 下单成功', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ prepay_id: 'wx_prepay_001' }),
      })

      const provider = createWechatPayProvider(testConfig)
      const result = await provider.createOrder({
        orderNo: 'ORD001',
        amount: 100,
        description: 'JSAPI 测试订单',
        tradeType: 'jsapi',
        userId: 'openid-user-001',
        notifyUrl: 'https://example.com/notify/wechat',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.provider).toBe('wechat')
        expect(result.data.tradeType).toBe('jsapi')
        expect(result.data.prepayId).toBe('wx_prepay_001')
        // JSAPI 客户端参数应包含签名相关字段
        expect(result.data.clientParams.appId).toBe(testConfig.appId)
        expect(result.data.clientParams.signType).toBe('RSA')
        expect(result.data.clientParams.paySign).toBeTruthy()
        expect(result.data.clientParams.timeStamp).toBeTruthy()
        expect(result.data.clientParams.nonceStr).toBeTruthy()
        expect(result.data.clientParams.package).toContain('prepay_id=')
      }

      // 验证 fetch 调用
      expect(fetchSpy).toHaveBeenCalledOnce()
      const [url, options] = fetchSpy.mock.calls[0]
      expect(url).toContain('/v3/pay/transactions/jsapi')
      expect(options.method).toBe('POST')
      expect(options.headers.Authorization).toContain('WECHATPAY2-SHA256-RSA2048')
      expect(options.signal).toBeDefined()
      const body = JSON.parse(options.body)
      expect(body.out_trade_no).toBe('ORD001')
      expect(body.amount.total).toBe(100)
      expect(body.payer.openid).toBe('openid-user-001')
    })

    it.each(['h5', 'native', 'app', 'mini_program', 'unknown'])('拒绝未实现的 %s，不能回落到 JSAPI', async (tradeType) => {
      const input = { orderNo: 'ORD002', amount: 100, description: '不支持的模式', tradeType: 'jsapi' as const, userId: 'openid-test', notifyUrl: 'https://example.com/notify' }
      // 模拟越过 TypeScript 的运行时输入，公共类型已经删除这些模式。
      Reflect.set(input, 'tradeType', tradeType)
      const result = await createWechatPayProvider(testConfig).createOrder(input)
      expect(result).toMatchObject({ success: false, error: { code: HaiPaymentError.UNSUPPORTED_TRADE_TYPE.code } })
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it.each([undefined, '', '  '])('缺少有效 openid=%s 时在联网前拒绝', async (userId) => {
      const result = await createWechatPayProvider(testConfig).createOrder({
        orderNo: 'ORD-OPENID',
        amount: 100,
        description: '缺少身份',
        tradeType: 'jsapi',
        userId,
        notifyUrl: 'https://example.com/notify',
      })
      expect(result).toMatchObject({ success: false, error: { code: HaiPaymentError.INVALID_INPUT.code } })
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it.each([{}, { prepay_id: '' }, { prepay_id: 42 }, { h5_url: 'https://example.com' }])('拒绝不能调起的预支付响应 %j', async (response) => {
      fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => response })
      const result = await createWechatPayProvider(testConfig).createOrder({
        orderNo: 'ORD-PREPAY',
        amount: 100,
        description: '协议校验',
        tradeType: 'jsapi',
        userId: 'openid-test',
        notifyUrl: 'https://example.com/notify',
      })
      expect(result).toMatchObject({ success: false, error: { code: HaiPaymentError.CREATE_ORDER_FAILED.code } })
    })

    it('附带 metadata 会包含在请求 body 中', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ prepay_id: 'test' }),
      })

      const provider = createWechatPayProvider(testConfig)
      await provider.createOrder({
        orderNo: 'ORD005',
        amount: 100,
        description: '带 metadata',
        tradeType: 'jsapi',
        userId: 'openid-xxx',
        notifyUrl: 'https://example.com/notify',
        metadata: { source: 'h5', campaign: 'spring' },
      })

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body)
      const attach = JSON.parse(body.attach)
      expect(attach.source).toBe('h5')
      expect(attach.campaign).toBe('spring')
    })

    it('拒绝 JSAPI 不支持的币种，不忽略用户输入', async () => {
      const result = await createWechatPayProvider(testConfig).createOrder({
        orderNo: 'ORD-CURRENCY',
        amount: 100,
        description: '币种',
        tradeType: 'jsapi',
        userId: 'openid-test',
        currency: 'USD',
        notifyUrl: 'https://example.com/notify',
      })
      expect(result).toMatchObject({ success: false, error: { code: HaiPaymentError.INVALID_INPUT.code } })
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('fetch 失败返回 CREATE_ORDER_FAILED', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      })

      const provider = createWechatPayProvider(testConfig)
      const result = await provider.createOrder({
        orderNo: 'ORD-FAIL',
        amount: 100,
        description: '失败测试',
        userId: 'openid-test',
        tradeType: 'jsapi',
        notifyUrl: 'https://example.com/notify',
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiPaymentError.CREATE_ORDER_FAILED.code)
        expect(result.error.cause).toBeDefined()
      }
    })

    it('网络异常返回 CREATE_ORDER_FAILED', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('Network error'))

      const provider = createWechatPayProvider(testConfig)
      const result = await provider.createOrder({
        orderNo: 'ORD-NET-ERR',
        amount: 100,
        description: '网络异常',
        userId: 'openid-test',
        tradeType: 'jsapi',
        notifyUrl: 'https://example.com/notify',
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiPaymentError.CREATE_ORDER_FAILED.code)
      }
    })
  })

  describe('handleNotify', () => {
    it('回调通知验签 + 解密解析成功', async () => {
      const resource = JSON.stringify({
        appid: testConfig.appId,
        mchid: testConfig.mchId,
        out_trade_no: 'ORD001',
        transaction_id: 'wx_txn_001',
        trade_state: 'SUCCESS',
        amount: { total: 100, payer_total: 100, currency: 'CNY' },
        success_time: '2024-01-01T12:00:00+08:00',
      })

      const nonce = '0123456789ab'
      const associatedData = 'transaction'
      const ciphertext = encryptNotifyResource(resource, nonce, associatedData, testConfig.apiV3Key)

      const body = JSON.stringify({
        id: 'wechat-event-1',
        create_time: '2024-01-01T12:00:00+08:00',
        event_type: 'TRANSACTION.SUCCESS',
        resource_type: 'encrypt-resource',
        resource: { algorithm: 'AEAD_AES_256_GCM', original_type: 'transaction', ciphertext, nonce, associated_data: associatedData },
      })

      const timestamp = String(Math.floor(Date.now() / 1000))
      const headerNonce = 'test-nonce-001'
      const signature = signNotifyPayload(timestamp, headerNonce, body, privateKey)

      const provider = createWechatPayProvider(testConfigWithCert)
      const result = await provider.handleNotify({
        body,
        headers: {
          'wechatpay-timestamp': timestamp,
          'wechatpay-nonce': headerNonce,
          'wechatpay-signature': signature,
          'wechatpay-serial': 'PUB_KEY_ID_TEST',
        },
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.orderNo).toBe('ORD001')
        expect(result.data.transactionId).toBe('wx_txn_001')
        expect(result.data.status).toBe('paid')
        expect(result.data.amount).toBe(100)
        expect(result.data.paidAt).toBeInstanceOf(Date)
      }
    })

    it('支付成功事件与非 SUCCESS 资源矛盾时拒绝', async () => {
      const resource = JSON.stringify({
        appid: testConfig.appId,
        mchid: testConfig.mchId,
        out_trade_no: 'ORD002',
        transaction_id: 'wx_txn_002',
        trade_state: 'PAYERROR',
        amount: { total: 200, payer_total: 200, currency: 'CNY' },
        success_time: '',
      })

      const nonce = '0123456789ab'
      const associatedData = 'transaction'
      const ciphertext = encryptNotifyResource(resource, nonce, associatedData, testConfig.apiV3Key)

      const body = JSON.stringify({
        id: 'wechat-event-1',
        create_time: '2024-01-01T12:00:00+08:00',
        event_type: 'TRANSACTION.SUCCESS',
        resource_type: 'encrypt-resource',
        resource: { algorithm: 'AEAD_AES_256_GCM', original_type: 'transaction', ciphertext, nonce, associated_data: associatedData },
      })

      const timestamp = String(Math.floor(Date.now() / 1000))
      const headerNonce = 'test-nonce-002'
      const signature = signNotifyPayload(timestamp, headerNonce, body, privateKey)

      const provider = createWechatPayProvider(testConfigWithCert)
      const result = await provider.handleNotify({
        body,
        headers: {
          'wechatpay-timestamp': timestamp,
          'wechatpay-nonce': headerNonce,
          'wechatpay-signature': signature,
          'wechatpay-serial': 'PUB_KEY_ID_TEST',
        },
      })

      expect(result.success).toBe(false)
      if (!result.success)
        expect(result.error.code).toBe(HaiPaymentError.NOTIFY_PARSE_FAILED.code)
    })

    it('无受信平台密钥返回 NOTIFY_VERIFY_FAILED', async () => {
      const provider = createWechatPayProvider({ ...testConfig, platformKeys: {} })
      const result = await provider.handleNotify({
        body: '{}',
        headers: {},
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiPaymentError.NOTIFY_VERIFY_FAILED.code)
      }
    })

    it('body 格式错误返回 NOTIFY_PARSE_FAILED', async () => {
      const body = 'invalid json'
      const timestamp = String(Math.floor(Date.now() / 1000))
      const headerNonce = 'test-nonce-003'
      const signature = signNotifyPayload(timestamp, headerNonce, body, privateKey)

      const provider = createWechatPayProvider(testConfigWithCert)
      const result = await provider.handleNotify({
        body,
        headers: {
          'wechatpay-timestamp': timestamp,
          'wechatpay-nonce': headerNonce,
          'wechatpay-signature': signature,
          'wechatpay-serial': 'PUB_KEY_ID_TEST',
        },
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiPaymentError.NOTIFY_PARSE_FAILED.code)
      }
    })

    it('平台公钥验签失败返回 NOTIFY_VERIFY_FAILED', async () => {
      const provider = createWechatPayProvider(testConfigWithCert)

      const result = await provider.handleNotify({
        body: '{"resource":{"ciphertext":"xxx","nonce":"xxx","associated_data":"xxx"}}',
        headers: {
          'wechatpay-timestamp': '1000000000',
          'wechatpay-nonce': 'testnonce',
          'wechatpay-signature': 'invalid-signature',
        },
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiPaymentError.NOTIFY_VERIFY_FAILED.code)
      }
    })
  })

  describe('queryOrder', () => {
    it('查询成功返回订单状态（SUCCESS → paid）', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          out_trade_no: 'ORD001',
          transaction_id: 'wx_txn_001',
          trade_state: 'SUCCESS',
          amount: { total: 100 },
          success_time: '2024-01-01T12:00:00+08:00',
        }),
      })

      const provider = createWechatPayProvider(testConfig)
      const result = await provider.queryOrder('ORD001')

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.orderNo).toBe('ORD001')
        expect(result.data.transactionId).toBe('wx_txn_001')
        expect(result.data.status).toBe('paid')
        expect(result.data.amount).toBe(100)
        expect(result.data.paidAt).toBeInstanceOf(Date)
      }
    })

    it.each([
      ['CLOSED', 'closed'],
      ['REFUND', 'refunded'],
      ['NOTPAY', 'pending'],
      ['PAYERROR', 'failed'],
      ['UNKNOWN_STATE', 'pending'], // 未知状态默认 pending
    ])('交易状态 %s 映射为 %s', async (tradeState, expectedStatus) => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          out_trade_no: 'ORD-MAP',
          transaction_id: 'txn',
          trade_state: tradeState,
          amount: { total: 100 },
        }),
      })

      const provider = createWechatPayProvider(testConfig)
      const result = await provider.queryOrder('ORD-MAP')

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.status).toBe(expectedStatus)
      }
    })

    it('fetch 失败返回 QUERY_ORDER_FAILED', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Not Found',
      })

      const provider = createWechatPayProvider(testConfig)
      const result = await provider.queryOrder('ORD-NOT-FOUND')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiPaymentError.QUERY_ORDER_FAILED.code)
      }
    })
  })

  describe('refund', () => {
    it('退款成功', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          refund_id: 'wx_refund_001',
          status: 'SUCCESS',
        }),
      })

      const provider = createWechatPayProvider(testConfig)
      const result = await provider.refund({
        orderNo: 'ORD001',
        refundNo: 'RF001',
        amount: 50,
        reason: '用户退款',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.refundNo).toBe('RF001')
        expect(result.data.refundId).toBe('wx_refund_001')
        expect(result.data.status).toBe('success')
      }

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body)
      expect(body.out_trade_no).toBe('ORD001')
      expect(body.out_refund_no).toBe('RF001')
      expect(body.amount.refund).toBe(50)
      expect(body.reason).toBe('用户退款')
    })

    it.each([
      ['PROCESSING', 'processing'],
      ['ABNORMAL', 'failed'],
      ['UNKNOWN', 'processing'], // 未知状态默认 processing
    ])('退款状态 %s 映射为 %s', async (status, expectedStatus) => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ refund_id: 'rf', status }),
      })

      const provider = createWechatPayProvider(testConfig)
      const result = await provider.refund({ orderNo: 'ORD', refundNo: 'RF', amount: 10 })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.status).toBe(expectedStatus)
      }
    })

    it('fetch 失败返回 REFUND_FAILED', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('timeout'))

      const provider = createWechatPayProvider(testConfig)
      const result = await provider.refund({ orderNo: 'ORD', refundNo: 'RF', amount: 10 })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiPaymentError.REFUND_FAILED.code)
      }
    })
  })

  describe('closeOrder', () => {
    it('关闭订单成功', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      })

      const provider = createWechatPayProvider(testConfig)
      const result = await provider.closeOrder('ORD001')

      expect(result.success).toBe(true)

      const [url, options] = fetchSpy.mock.calls[0]
      expect(url).toContain('/v3/pay/transactions/out-trade-no/ORD001/close')
      expect(options.method).toBe('POST')
      const body = JSON.parse(options.body)
      expect(body.mchid).toBe(testConfig.mchId)
    })

    it('fetch 失败返回 CLOSE_ORDER_FAILED', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('connection refused'))

      const provider = createWechatPayProvider(testConfig)
      const result = await provider.closeOrder('ORD-FAIL')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiPaymentError.CLOSE_ORDER_FAILED.code)
      }
    })
  })

  describe('provider.name', () => {
    it('name 为 wechat', () => {
      const provider = createWechatPayProvider(testConfig)
      expect(provider.name).toBe('wechat')
    })
  })
})
