/**
 * @h-ai/payment — payment-provider-alipay（支付宝 Provider）单元测试
 *
 * 通过 mock fetch 测试支付宝 Provider 的各项操作。
 */

import type { PaymentProvider } from '../src/payment-types'
import { createSign, generateKeyPairSync } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AlipayConfigSchema } from '../src/payment-config'
import { HaiPaymentError } from '../src/payment-types'
import { formatAlipayTime } from '../src/providers/alipay/payment-alipay-time'
import { createAlipayProvider } from '../src/providers/alipay/payment-provider-alipay'

// 生成测试用 RSA 密钥对
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})

const testConfig = AlipayConfigSchema.parse({
  appId: '2021000000000001',
  sellerId: '2088_test',
  privateKey,
  alipayPublicKey: publicKey,
  returnUrl: 'https://example.invalid/payment/return',
})

/** 辅助：用私钥为回调参数签名 */
function signNotifyParams(params: Record<string, string>): string {
  Object.assign(params, {
    app_id: testConfig.appId,
    seller_id: testConfig.sellerId,
    notify_id: 'alipay-notify-test',
    notify_type: 'trade_status_sync',
    notify_time: formatAlipayTime(new Date()),
    gmt_payment: '2024-01-01 12:00:00',
    ...params,
  })
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
  return Object.entries({
    app_id: testConfig.appId,
    seller_id: testConfig.sellerId,
    notify_id: 'alipay-notify-test',
    notify_type: 'trade_status_sync',
    notify_time: formatAlipayTime(new Date()),
    gmt_payment: '2024-01-01 12:00:00',
    ...params,
  })
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
}

describe('payment-provider-alipay', () => {
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
    it('h5 返回页面协议参数，不向支付网关发送 JSON 下单请求', async () => {
      const result = await createAlipayProvider(testConfig).createOrder({
        orderNo: 'ORD001',
        amount: 150,
        description: 'H5 测试订单',
        tradeType: 'h5',
        notifyUrl: 'https://example.com/notify',
      })
      expect(result.success).toBe(true)
      if (!result.success)
        return
      expect(result.data.prepayId).toBeUndefined()
      expect(result.data.clientParams.gateway).toBe('https://openapi.alipay.com/gateway.do')
      expect(result.data.clientParams.fields).toMatchObject({
        method: 'alipay.trade.wap.pay',
        return_url: testConfig.returnUrl,
        sign_type: 'RSA2',
      })
      expect(JSON.stringify(result.data.clientParams.fields)).toContain('1.50')
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it.each(['jsapi', 'native', 'app', 'mini_program', 'unknown'])('拒绝未实现的 %s 且不请求网关', async (tradeType) => {
      const input = { orderNo: 'ORD002', amount: 100, description: '不支持的模式', tradeType: 'h5' as const, notifyUrl: 'https://example.com/notify' }
      Reflect.set(input, 'tradeType', tradeType)
      const result = await createAlipayProvider(testConfig).createOrder(input)
      expect(result).toMatchObject({ success: false, error: { code: HaiPaymentError.UNSUPPORTED_TRADE_TYPE.code } })
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('沙箱模式返回固定沙箱网关', async () => {
      const result = await createAlipayProvider({ ...testConfig, sandbox: true }).createOrder({
        orderNo: 'ORD003',
        amount: 100,
        description: '沙箱',
        tradeType: 'h5',
        notifyUrl: 'https://example.com/notify',
      })
      expect(result.success && result.data.clientParams.gateway).toBe('https://openapi-sandbox.dl.alipaydev.com/gateway.do')
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('签名失败返回 CREATE_ORDER_FAILED', async () => {
      const result = await createAlipayProvider({ ...testConfig, privateKey: 'invalid-key' }).createOrder({
        orderNo: 'ORD004',
        amount: 100,
        description: '签名失败',
        tradeType: 'h5',
        notifyUrl: 'https://example.com/notify',
      })
      expect(result).toMatchObject({ success: false, error: { code: HaiPaymentError.CREATE_ORDER_FAILED.code } })
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

    it('非 paid 状态时 paidAt 为 undefined', async () => {
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

      const [, options] = fetchSpy.mock.calls[0]
      expect(new URLSearchParams(options.body).get('method')).toBe('alipay.trade.close')
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
    it.each(['RSA2', 'RSA'] as const)('%s 进入完整签名表单参数', async (signType) => {
      const result = await createAlipayProvider({ ...testConfig, signType }).createOrder({
        orderNo: 'ORD-ST',
        amount: 100,
        description: '签名类型',
        tradeType: 'h5',
        notifyUrl: 'https://example.com/notify',
      })
      expect(result.success && result.data.clientParams.fields).toMatchObject({ sign_type: signType })
      expect(fetchSpy).not.toHaveBeenCalled()
    })
  })
})
