/**
 * @h-ai/payment — alipay-provider（支付宝 Provider）单元测试
 *
 * 通过 mock fetch 测试支付宝 Provider 的各项操作。
 */

import type { PaymentProvider } from '../src/payment-types'
import { createSign, generateKeyPairSync } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HaiPaymentError } from '../src/payment-types'
import { createAlipayProvider } from '../src/providers/alipay/alipay-provider'

// 生成测试用 RSA 密钥对
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})

const testConfig = {
  appId: '2021000000000001',
  privateKey,
  alipayPublicKey: publicKey,
}

/** 辅助：用私钥为回调参数签名 */
function signNotifyParams(params: Record<string, string>): string {
  const sorted = Object.keys(params)
    .filter(k => k !== 'sign' && k !== 'sign_type' && params[k] !== undefined && params[k] !== '')
    .sort()
    .map(k => `${k}=${params[k]}`)
    .join('&')

  const sign = createSign('RSA-SHA256')
  sign.update(sorted)
  return sign.sign(privateKey, 'base64')
}

/** 构建 form-urlencoded 回调 body */
function buildNotifyBody(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
}

describe('alipay-provider', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  describe('createOrder', () => {
    it('h5 下单成功', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          alipay_trade_wap_pay_response: {
            code: '10000',
            trade_no: 'ALI_TXN_001',
            out_trade_no: 'ORD001',
          },
        }),
      })

      const provider = createAlipayProvider(testConfig)
      const result = await provider.createOrder({
        orderNo: 'ORD001',
        amount: 1000, // 10 元
        description: 'H5 测试订单',
        tradeType: 'h5',
        notifyUrl: 'https://example.com/notify/alipay',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.provider).toBe('alipay')
        expect(result.data.tradeType).toBe('h5')
        expect(result.data.prepayId).toBe('ALI_TXN_001')
      }

      // 验证 fetch 调用正确的网关（非沙箱）
      const [url, options] = fetchSpy.mock.calls[0]
      expect(url).toContain('openapi.alipay.com')
      expect(url).toContain('sign=')
      expect(options.signal).toBeDefined()
    })

    it('jSAPI 下单使用 alipay.trade.create 方法', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          alipay_trade_create_response: { code: '10000', out_trade_no: 'ORD002', trade_no: 'ALI_TXN_002' },
        }),
      })

      const provider = createAlipayProvider(testConfig)
      const result = await provider.createOrder({
        orderNo: 'ORD002',
        amount: 500,
        description: 'JSAPI 测试',
        tradeType: 'jsapi',
        notifyUrl: 'https://example.com/notify',
      })

      const [url] = fetchSpy.mock.calls[0]
      expect(result.success).toBe(true)
      expect(url).toContain('method=alipay.trade.create')
    })

    it('app 下单使用 alipay.trade.app.pay 方法', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          alipay_trade_app_pay_response: { code: '10000', out_trade_no: 'ORD003', trade_no: 'ALI_TXN_003' },
        }),
      })

      const provider = createAlipayProvider(testConfig)
      const result = await provider.createOrder({
        orderNo: 'ORD003',
        amount: 100,
        description: 'App 测试',
        tradeType: 'app',
        notifyUrl: 'https://example.com/notify',
      })

      const [url] = fetchSpy.mock.calls[0]
      expect(result.success).toBe(true)
      expect(url).toContain('method=alipay.trade.app.pay')
    })

    it('native 下单使用 alipay.trade.precreate 方法', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          alipay_trade_precreate_response: { code: '10000', out_trade_no: 'ORD004', qr_code: 'https://qr.alipay.com/test-order' },
        }),
      })

      const provider = createAlipayProvider(testConfig)
      const result = await provider.createOrder({
        orderNo: 'ORD004',
        amount: 100,
        description: 'Native 测试',
        tradeType: 'native',
        notifyUrl: 'https://example.com/notify',
      })

      const [url] = fetchSpy.mock.calls[0]
      expect(result.success).toBe(true)
      if (result.success)
        expect(result.data.clientParams.qr_code).toBe('https://qr.alipay.com/test-order')
      expect(url).toContain('method=alipay.trade.precreate')
    })

    it('金额从分转换为元（100 分 → 1.00 元）', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          alipay_trade_wap_pay_response: { code: '10000', out_trade_no: 'ORD-AMOUNT', trade_no: 'ALI_AMOUNT' },
        }),
      })

      const provider = createAlipayProvider(testConfig)
      await provider.createOrder({
        orderNo: 'ORD-AMOUNT',
        amount: 150, // 1.50 元
        description: '金额测试',
        tradeType: 'h5',
        notifyUrl: 'https://example.com/notify',
      })

      const [url] = fetchSpy.mock.calls[0]
      // biz_content 中包含 total_amount 1.50
      expect(url).toContain('1.50')
    })

    it('沙箱模式使用沙箱网关', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ alipay_trade_wap_pay_response: { code: '10000', out_trade_no: 'ORD-SANDBOX', trade_no: 'ALI_SANDBOX' } }),
      })

      const sandboxConfig = { ...testConfig, sandbox: true }
      const provider = createAlipayProvider(sandboxConfig)
      await provider.createOrder({
        orderNo: 'ORD-SANDBOX',
        amount: 100,
        description: '沙箱测试',
        tradeType: 'h5',
        notifyUrl: 'https://example.com/notify',
      })

      const [url] = fetchSpy.mock.calls[0]
      expect(url).toContain('openapi-sandbox')
    })

    it('fetch 失败返回 CREATE_ORDER_FAILED', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Server Error',
      })

      const provider = createAlipayProvider(testConfig)
      const result = await provider.createOrder({
        orderNo: 'ORD-FAIL',
        amount: 100,
        description: '失败测试',
        tradeType: 'h5',
        notifyUrl: 'https://example.com/notify',
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiPaymentError.CREATE_ORDER_FAILED.code)
      }
    })

    it('网络异常返回 CREATE_ORDER_FAILED', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('DNS resolution failed'))

      const provider = createAlipayProvider(testConfig)
      const result = await provider.createOrder({
        orderNo: 'ORD-NET',
        amount: 100,
        description: '网络异常',
        tradeType: 'h5',
        notifyUrl: 'https://example.com/notify',
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiPaymentError.CREATE_ORDER_FAILED.code)
      }
    })
  })

  describe('handleNotify', () => {
    it('合法回调验签通过并正确解析', async () => {
      const params: Record<string, string> = {
        out_trade_no: 'ORD001',
        trade_no: 'T2024001',
        trade_status: 'TRADE_SUCCESS',
        total_amount: '10.00',
        gmt_payment: '2024-01-01 12:00:00',
        sign_type: 'RSA2',
      }
      params.sign = signNotifyParams(params)
      const body = buildNotifyBody(params)

      const provider = createAlipayProvider(testConfig)
      const result = await provider.handleNotify({ body, headers: {} })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.orderNo).toBe('ORD001')
        expect(result.data.transactionId).toBe('T2024001')
        expect(result.data.status).toBe('paid')
        expect(result.data.amount).toBe(1000) // 10.00 元 → 1000 分
        expect(result.data.paidAt).toBeInstanceOf(Date)
      }
    })

    it.each([
      ['TRADE_SUCCESS', 'paid'],
      ['TRADE_FINISHED', 'paid'],
      ['TRADE_CLOSED', 'closed'],
      ['WAIT_BUYER_PAY', 'pending'],
    ])('交易状态 %s 映射为 %s', async (tradeStatus, expectedStatus) => {
      const params: Record<string, string> = {
        out_trade_no: 'ORD-MAP',
        trade_no: 'T-MAP',
        trade_status: tradeStatus,
        total_amount: '1.00',
        sign_type: 'RSA2',
      }
      params.sign = signNotifyParams(params)
      const body = buildNotifyBody(params)

      const provider = createAlipayProvider(testConfig)
      const result = await provider.handleNotify({ body, headers: {} })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.status).toBe(expectedStatus)
      }
    })

    it('元转分精度正确（10.50 元 → 1050 分）', async () => {
      const params: Record<string, string> = {
        out_trade_no: 'ORD-PREC',
        trade_no: 'T-PREC',
        trade_status: 'TRADE_SUCCESS',
        total_amount: '10.50',
        sign_type: 'RSA2',
      }
      params.sign = signNotifyParams(params)
      const body = buildNotifyBody(params)

      const provider = createAlipayProvider(testConfig)
      const result = await provider.handleNotify({ body, headers: {} })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.amount).toBe(1050)
      }
    })

    it('无 gmt_payment 时 paidAt 为 undefined', async () => {
      const params: Record<string, string> = {
        out_trade_no: 'ORD-NOPAY',
        trade_no: 'T-NOPAY',
        trade_status: 'WAIT_BUYER_PAY',
        total_amount: '1.00',
        sign_type: 'RSA2',
      }
      params.sign = signNotifyParams(params)
      const body = buildNotifyBody(params)

      const provider = createAlipayProvider(testConfig)
      const result = await provider.handleNotify({ body, headers: {} })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.paidAt).toBeUndefined()
      }
    })

    it('验签失败返回 NOTIFY_VERIFY_FAILED', async () => {
      const params: Record<string, string> = {
        out_trade_no: 'ORD-BAD',
        trade_no: 'T-BAD',
        trade_status: 'TRADE_SUCCESS',
        total_amount: '1.00',
        sign: 'invalid-signature',
        sign_type: 'RSA2',
      }
      const body = buildNotifyBody(params)

      const provider = createAlipayProvider(testConfig)
      const result = await provider.handleNotify({ body, headers: {} })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiPaymentError.NOTIFY_VERIFY_FAILED.code)
      }
    })

    it('非法 total_amount 返回 NOTIFY_PARSE_FAILED', async () => {
      const params: Record<string, string> = {
        out_trade_no: 'ORD-AMOUNT-BAD',
        trade_no: 'T-AMOUNT-BAD',
        trade_status: 'TRADE_SUCCESS',
        total_amount: '10.bad',
        sign_type: 'RSA2',
      }
      params.sign = signNotifyParams(params)
      const body = buildNotifyBody(params)

      const provider = createAlipayProvider(testConfig)
      const result = await provider.handleNotify({ body, headers: {} })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiPaymentError.NOTIFY_PARSE_FAILED.code)
      }
    })
  })

  describe('queryOrder', () => {
    it('查询成功返回订单状态', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          alipay_trade_query_response: {
            code: '10000',
            out_trade_no: 'ORD001',
            trade_no: 'ALI_Q_001',
            trade_status: 'TRADE_SUCCESS',
            total_amount: '5.00',
            send_pay_date: '2024-01-01 12:00:00',
          },
        }),
      })

      const provider = createAlipayProvider(testConfig)
      const result = await provider.queryOrder('ORD001')

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.orderNo).toBe('ORD001')
        expect(result.data.transactionId).toBe('ALI_Q_001')
        expect(result.data.status).toBe('paid')
        expect(result.data.amount).toBe(500) // 5.00 元 → 500 分
        expect(result.data.paidAt).toBeInstanceOf(Date)
        expect(result.data.paidAt?.toISOString()).toBe('2024-01-01T04:00:00.000Z')
      }
    })

    it.each([
      ['TRADE_SUCCESS', 'paid'],
      ['TRADE_CLOSED', 'closed'],
      ['TRADE_FINISHED', 'paid'],
      ['WAIT_BUYER_PAY', 'pending'],
    ])('查询状态 %s 映射为 %s', async (tradeStatus, expectedStatus) => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          alipay_trade_query_response: {
            code: '10000',
            out_trade_no: 'ORD-MAP',
            trade_no: 'ALI_MAP',
            trade_status: tradeStatus,
            total_amount: '1.00',
          },
        }),
      })

      const provider = createAlipayProvider(testConfig)
      const result = await provider.queryOrder('ORD-MAP')

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.status).toBe(expectedStatus)
      }
    })

    it('fetch 失败返回 QUERY_ORDER_FAILED', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('timeout'))

      const provider = createAlipayProvider(testConfig)
      const result = await provider.queryOrder('ORD-FAIL')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiPaymentError.QUERY_ORDER_FAILED.code)
      }
    })
  })

  describe('refund', () => {
    it('退款成功（fund_change=Y → success）', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          alipay_trade_refund_response: {
            code: '10000',
            out_trade_no: 'ORD001',
            refund_fee: '5.00',
            trade_no: 'ALI_RF_001',
            fund_change: 'Y',
          },
        }),
      })

      const provider = createAlipayProvider(testConfig)
      const result = await provider.refund({
        orderNo: 'ORD001',
        refundNo: 'RF001',
        amount: 500,
        reason: '用户退款',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.refundNo).toBe('RF001')
        expect(result.data.refundId).toBe('ALI_RF_001')
        expect(result.data.status).toBe('success')
      }
    })

    it.each(['N', undefined])('fund_change=%s 时状态为 processing，不宣称退款成功', async (fundChange) => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          alipay_trade_refund_response: {
            code: '10000',
            out_trade_no: 'ORD002',
            refund_fee: '1.00',
            trade_no: 'ALI_RF_002',
            fund_change: fundChange,
          },
        }),
      })

      const provider = createAlipayProvider(testConfig)
      const result = await provider.refund({
        orderNo: 'ORD002',
        refundNo: 'RF002',
        amount: 100,
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.status).toBe('processing')
      }
    })

    it('fetch 失败返回 REFUND_FAILED', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('error'))

      const provider = createAlipayProvider(testConfig)
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
        json: async () => ({ alipay_trade_close_response: { code: '10000', out_trade_no: 'ORD001', trade_no: 'ALI_CLOSE' } }),
      })

      const provider = createAlipayProvider(testConfig)
      const result = await provider.closeOrder('ORD001')

      expect(result.success).toBe(true)

      const [url] = fetchSpy.mock.calls[0]
      expect(url).toContain('method=alipay.trade.close')
    })

    it('fetch 失败返回 CLOSE_ORDER_FAILED', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('error'))

      const provider = createAlipayProvider(testConfig)
      const result = await provider.closeOrder('ORD-FAIL')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiPaymentError.CLOSE_ORDER_FAILED.code)
      }
    })
  })

  describe('支付宝业务响应校验', () => {
    const operations = [
      {
        method: 'alipay.trade.create',
        errorCode: HaiPaymentError.CREATE_ORDER_FAILED.code,
        fields: { out_trade_no: 'ORDER_CHECK', trade_no: 'ALI_CHECK' },
        run: (provider: PaymentProvider) => provider.createOrder({
          orderNo: 'ORDER_CHECK',
          amount: 100,
          description: '业务响应校验',
          tradeType: 'jsapi',
          notifyUrl: 'https://example.com/notify',
        }),
      },
      {
        method: 'alipay.trade.query',
        errorCode: HaiPaymentError.QUERY_ORDER_FAILED.code,
        fields: { out_trade_no: 'ORDER_CHECK', trade_no: 'ALI_CHECK', trade_status: 'TRADE_SUCCESS', total_amount: '1.00' },
        run: (provider: PaymentProvider) => provider.queryOrder('ORDER_CHECK'),
      },
      {
        method: 'alipay.trade.refund',
        errorCode: HaiPaymentError.REFUND_FAILED.code,
        fields: { out_trade_no: 'ORDER_CHECK', trade_no: 'ALI_CHECK', refund_fee: '1.00' },
        run: (provider: PaymentProvider) => provider.refund({ orderNo: 'ORDER_CHECK', refundNo: 'REFUND_CHECK', amount: 100 }),
      },
      {
        method: 'alipay.trade.close',
        errorCode: HaiPaymentError.CLOSE_ORDER_FAILED.code,
        fields: { out_trade_no: 'ORDER_CHECK', trade_no: 'ALI_CHECK' },
        run: (provider: PaymentProvider) => provider.closeOrder('ORDER_CHECK'),
      },
    ]

    for (const operation of operations) {
      describe(operation.method, () => {
        const key = `${operation.method.replace(/\./g, '_')}_response`

        it.each(['ACQ.TRADE_NOT_EXIST', 'ACQ.BUYER_BALANCE_NOT_ENOUGH', 'isv.insufficient-isv-permissions', 'ACQ.TRADE_HAS_SUCCESS'])(
          'hTTP 200 + code=40004/%s 返回操作失败，不泄漏渠道描述',
          async (subCode) => {
            const sensitiveValue = 'sensitive-buyer@example.com'
            fetchSpy.mockResolvedValueOnce({
              ok: true,
              json: async () => ({
                [key]: { code: '40004', sub_code: subCode, msg: sensitiveValue, sub_msg: sensitiveValue, buyer_logon_id: sensitiveValue },
              }),
            })

            const result = await operation.run(createAlipayProvider(testConfig))
            expect(result.success).toBe(false)
            expect(result).not.toHaveProperty('data')
            if (!result.success) {
              expect(result.error.code).toBe(operation.errorCode)
              expect(result.error.cause).toBeInstanceOf(Error)
              if (result.error.cause instanceof Error) {
                expect(result.error.cause.message).toContain('40004')
                expect(result.error.cause.message).toContain(subCode)
                expect(result.error.cause.message).not.toContain(sensitiveValue)
                expect(result.error.cause.cause).toBeUndefined()
              }
              expect(JSON.stringify(result.error)).not.toContain(sensitiveValue)
            }
          },
        )

        it.each([
          null,
          [],
          {},
          { another_response: { code: '10000' } },
          { [key]: null },
          { [key]: [] },
          { [key]: {} },
          { [key]: { code: 10000 } },
          { [key]: { code: '10000', ...operation.fields }, error_response: { code: '40004' } },
          { [key]: { code: '20000' } },
        ])('畸形或失败响应 %# 不能返回成功', async (body) => {
          fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => body })
          const result = await operation.run(createAlipayProvider(testConfig))
          expect(result.success).toBe(false)
          if (!result.success)
            expect(result.error.code).toBe(operation.errorCode)
        })

        it.each(Object.keys(operation.fields))('code=10000 但缺少 %s 仍返回失败', async (field) => {
          const fields: Record<string, unknown> = { ...operation.fields }
          delete fields[field]
          fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => ({ [key]: { code: '10000', ...fields } }) })
          const result = await operation.run(createAlipayProvider(testConfig))
          expect(result.success).toBe(false)
          if (!result.success)
            expect(result.error.code).toBe(operation.errorCode)
        })

        it('返回其它订单号时失败，不能把渠道结果用于本次订单', async () => {
          fetchSpy.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ [key]: { code: '10000', ...operation.fields, out_trade_no: 'ANOTHER_ORDER' } }),
          })
          const result = await operation.run(createAlipayProvider(testConfig))
          expect(result.success).toBe(false)
        })

        it('非法 JSON 的错误不泄漏响应片段', async () => {
          fetchSpy.mockResolvedValueOnce({
            ok: true,
            json: async () => { throw new SyntaxError('Unexpected token in sensitive-buyer@example.com') },
          })
          const result = await operation.run(createAlipayProvider(testConfig))
          expect(result.success).toBe(false)
          if (!result.success && result.error.cause instanceof Error) {
            expect(result.error.cause.message).toBe('Invalid Alipay JSON response')
            expect(result.error.cause.cause).toBeUndefined()
          }
        })
      })
    }

    it.each([
      { trade_status: 'UNKNOWN_STATUS' },
      { total_amount: '1.001' },
      { total_amount: '-1.00' },
      { total_amount: '1e2' },
      { total_amount: 'NaN' },
      { total_amount: '90071992547409.92' },
      { send_pay_date: 'invalid-date' },
    ])('查单拒绝非法状态或金额：%j', async (fields) => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          alipay_trade_query_response: {
            code: '10000',
            out_trade_no: 'ORDER_CHECK',
            trade_no: 'ALI_CHECK',
            trade_status: 'TRADE_SUCCESS',
            total_amount: '1.00',
            ...fields,
          },
        }),
      })
      const result = await createAlipayProvider(testConfig).queryOrder('ORDER_CHECK')
      expect(result.success).toBe(false)
    })

    it('原始子错误码含敏感值时不回传', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ alipay_trade_close_response: { code: '40004', sub_code: 'sensitive-buyer@example.com' } }),
      })
      const result = await createAlipayProvider(testConfig).closeOrder('ORDER_CHECK')
      expect(result.success).toBe(false)
      if (!result.success && result.error.cause instanceof Error)
        expect(result.error.cause.message).toBe('Alipay business request failed (code=40004)')
    })

    it('预创建缺少 qr_code 时失败，不能返回无法支付的订单', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ alipay_trade_precreate_response: { code: '10000', out_trade_no: 'ORDER_CHECK', trade_no: 'ALI_CHECK' } }),
      })
      const result = await createAlipayProvider(testConfig).createOrder({
        orderNo: 'ORDER_CHECK',
        amount: 100,
        description: '缺失二维码',
        tradeType: 'native',
        notifyUrl: 'https://example.com/notify',
      })
      expect(result.success).toBe(false)
    })

    it.each([{ refund_fee: 'bad-amount' }, { refund_fee: '90071992547409.92' }, { fund_change: 'UNKNOWN' }])(
      '退款拒绝非法业务字段：%j',
      async (fields) => {
        fetchSpy.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            alipay_trade_refund_response: {
              code: '10000',
              out_trade_no: 'ORDER_CHECK',
              trade_no: 'ALI_CHECK',
              refund_fee: '1.00',
              fund_change: 'Y',
              ...fields,
            },
          }),
        })
        const result = await createAlipayProvider(testConfig).refund({ orderNo: 'ORDER_CHECK', refundNo: 'REFUND_CHECK', amount: 100 })
        expect(result.success).toBe(false)
      },
    )

    it('refund_fee 为累计退款额，可大于本次退款金额', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          alipay_trade_refund_response: { code: '10000', out_trade_no: 'ORDER_CHECK', trade_no: 'ALI_CHECK', refund_fee: '2.00', fund_change: 'Y' },
        }),
      })
      const result = await createAlipayProvider(testConfig).refund({ orderNo: 'ORDER_CHECK', refundNo: 'REFUND_CHECK', amount: 100 })
      expect(result.success).toBe(true)
      if (result.success)
        expect(result.data.status).toBe('success')
    })
  })

  describe('provider.name', () => {
    it('name 为 alipay', () => {
      const provider = createAlipayProvider(testConfig)
      expect(provider.name).toBe('alipay')
    })
  })

  describe('signType 配置', () => {
    it('默认使用 RSA2', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ alipay_trade_wap_pay_response: { code: '10000', out_trade_no: 'ORD-ST', trade_no: 'ALI_ST' } }),
      })

      const provider = createAlipayProvider(testConfig)
      await provider.createOrder({
        orderNo: 'ORD-ST',
        amount: 100,
        description: 'signType 测试',
        tradeType: 'h5',
        notifyUrl: 'https://example.com/notify',
      })

      const [url] = fetchSpy.mock.calls[0]
      expect(url).toContain('sign_type=RSA2')
    })

    it('可配置 RSA 签名类型', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ alipay_trade_wap_pay_response: { code: '10000', out_trade_no: 'ORD-RSA', trade_no: 'ALI_RSA' } }),
      })

      const rsaConfig = { ...testConfig, signType: 'RSA' as const }
      const provider = createAlipayProvider(rsaConfig)
      await provider.createOrder({
        orderNo: 'ORD-RSA',
        amount: 100,
        description: 'RSA 签名测试',
        tradeType: 'h5',
        notifyUrl: 'https://example.com/notify',
      })

      const [url] = fetchSpy.mock.calls[0]
      expect(url).toContain('sign_type=RSA')
    })
  })
})
