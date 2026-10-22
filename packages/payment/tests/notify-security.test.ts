/** 通知身份、协议时钟、证书轮换与请求保密边界回归。 */
import { Buffer } from 'node:buffer'
import { createCipheriv, createHmac, createPublicKey, createSign, generateKeyPairSync, X509Certificate } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HaiPaymentError } from '../src/payment-types'
import { createAlipayProvider } from '../src/providers/alipay/alipay-provider'
import { formatAlipayTime } from '../src/providers/alipay/alipay-time'
import { createStripeProvider } from '../src/providers/stripe/stripe-provider'
import { createWechatPayProvider } from '../src/providers/wechat/wechat-pay-provider'

const now = new Date('2026-10-22T00:00:00Z')
const pair = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})
const rotatedPair = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})
const alipayConfig = { appId: 'app_security', sellerId: 'seller_security', privateKey: pair.privateKey, alipayPublicKey: pair.publicKey }
const wechatConfig = {
  appId: 'wx_security',
  mchId: 'mch_security',
  apiV3Key: '0123456789abcdef0123456789abcdef',
  serialNo: 'merchant_serial',
  privateKey: pair.privateKey,
  platformKeys: { PUB_KEY_ID_1: pair.publicKey, PUB_KEY_ID_2: rotatedPair.publicKey },
}

/** 最小 DER 构造只用于测试生成临时证书，避免硬编码私钥或依赖 openssl 命令。 */
function der(tag: number, ...parts: Buffer[]): Buffer {
  const bytes = Buffer.concat(parts)
  const length = bytes.length < 128 ? Buffer.from([bytes.length]) : Buffer.from([0x82, bytes.length >> 8, bytes.length & 255])
  return Buffer.concat([Buffer.from([tag]), length, bytes])
}

/** 用临时密钥生成真实 X.509 PEM，以验证序列号与有效期而非 mock crypto。 */
function testCertificate(serial: number, notAfter = '300101000000Z'): string {
  const algorithm = Buffer.from('300d06092a864886f70d01010b0500', 'hex')
  const name = der(0x30, der(0x31, der(0x30, Buffer.from('0603550403', 'hex'), der(0x0C, Buffer.from('Payment test')))))
  const tbs = der(0x30, Buffer.from('a003020102', 'hex'), der(0x02, Buffer.from([serial])), algorithm, name, der(0x30, der(0x17, Buffer.from('200101000000Z')), der(0x17, Buffer.from(notAfter))), name, createPublicKey(pair.publicKey).export({ type: 'spki', format: 'der' }))
  const signer = createSign('RSA-SHA256')
  signer.update(tbs)
  const certificate = der(0x30, tbs, algorithm, der(0x03, Buffer.from([0]), signer.sign(pair.privateKey)))
  return `-----BEGIN CERTIFICATE-----\n${certificate.toString('base64').match(/.{1,64}/g)!.join('\n')}\n-----END CERTIFICATE-----`
}

/** 构造具有真实签名的支付宝通知；日期故意可早于当前日期以覆盖渠道重试。 */
function alipayRequest(overrides: Record<string, string> = {}) {
  const params: Record<string, string> = {
    app_id: alipayConfig.appId,
    seller_id: alipayConfig.sellerId,
    notify_id: 'ALI_EVENT',
    notify_type: 'trade_status_sync',
    notify_time: '2026-10-21 08:00:00',
    out_trade_no: 'ORDER_SECURITY',
    trade_no: 'ALI_TRADE',
    trade_status: 'TRADE_SUCCESS',
    total_amount: '1.00',
    gmt_payment: '2026-10-20 08:00:00',
    sign_type: 'RSA2',
    ...overrides,
  }
  const signer = createSign(params.sign_type === 'RSA' ? 'RSA-SHA1' : 'RSA-SHA256')
  signer.update(Object.keys(params).filter(key => key !== 'sign_type').sort().map(key => `${key}=${params[key]}`).join('&'))
  params.sign = signer.sign(pair.privateKey, 'base64')
  return { body: new URLSearchParams(params).toString(), headers: {} }
}

/** 构造真实 AES-GCM 加密与 RSA 签名的微信通知。 */
function wechatRequest(options: {
  resource?: Record<string, unknown>
  envelope?: Record<string, unknown>
  timestamp?: string
  serial?: string
  privateKey?: string
} = {}) {
  const resource = {
    appid: wechatConfig.appId,
    mchid: wechatConfig.mchId,
    out_trade_no: 'ORDER_SECURITY',
    transaction_id: 'WX_TRADE',
    trade_state: 'SUCCESS',
    amount: { total: 100, currency: 'CNY' },
    success_time: '2026-10-20T00:00:00Z',
    ...options.resource,
  }
  const cipher = createCipheriv('aes-256-gcm', wechatConfig.apiV3Key, '0123456789ab')
  cipher.setAAD(Buffer.from('transaction'))
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(resource)), cipher.final(), cipher.getAuthTag()]).toString('base64')
  const body = JSON.stringify({
    id: 'WX_EVENT',
    create_time: '2026-10-20T00:00:00Z',
    event_type: 'TRANSACTION.SUCCESS',
    resource_type: 'encrypt-resource',
    resource: { algorithm: 'AEAD_AES_256_GCM', original_type: 'transaction', ciphertext: encrypted, nonce: '0123456789ab', associated_data: 'transaction' },
    ...options.envelope,
  })
  const timestamp = options.timestamp ?? String(now.getTime() / 1000)
  const nonce = 'notify-nonce'
  const signer = createSign('RSA-SHA256')
  signer.update(`${timestamp}\n${nonce}\n${body}\n`)
  return {
    body,
    headers: {
      'Wechatpay-Timestamp': timestamp,
      'Wechatpay-Nonce': nonce,
      'Wechatpay-Serial': options.serial ?? 'PUB_KEY_ID_1',
      'Wechatpay-Signature': signer.sign(options.privateKey ?? pair.privateKey, 'base64'),
    },
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(now)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('alipay notification security', () => {
  it.each([{ app_id: 'OTHER_APP' }, { seller_id: 'OTHER_SELLER' }, { sign_type: 'RSA' }])('有效签名但身份或算法错误时拒绝：%j', async (fields) => {
    const result = await createAlipayProvider(alipayConfig).handleNotify(alipayRequest(fields))
    expect(result).toMatchObject({ success: false, error: { code: HaiPaymentError.NOTIFY_VERIFY_FAILED.code } })
  })

  it.each([
    { notify_time: '2026-02-30 10:00:00' },
    { notify_time: '2026-10-22T08:00:00' },
    { notify_time: '2026-10-22 09:00:00' },
    { gmt_payment: '2026-02-30 10:00:00' },
    { notify_id: '' },
    { trade_status: 'UNKNOWN' },
  ])('拒绝畸形日期/未来通知/未知状态：%j', async (fields) => {
    expect((await createAlipayProvider(alipayConfig).handleNotify(alipayRequest(fields))).success).toBe(false)
  })

  it('跨日合法重试保留同一事件和支付时间，返回币种供业务核对', async () => {
    const result = await createAlipayProvider(alipayConfig).handleNotify(alipayRequest())
    expect(result).toMatchObject({ success: true, data: { eventId: 'ALI_EVENT', currency: 'CNY', status: 'paid' } })
    if (result.success)
      expect(result.data.paidAt?.toISOString()).toBe('2026-10-20T00:00:00.000Z')
  })

  it('重复表单字段不能借 Object.fromEntries 覆盖身份字段', async () => {
    const request = alipayRequest()
    request.body += '&app_id=OTHER_APP'
    expect((await createAlipayProvider(alipayConfig).handleNotify(request)).success).toBe(false)
  })

  it('uTC 节点使用北京时间签名，并将订单和签名放在 form body 而非 URL', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ alipay_trade_create_response: { code: '10000', out_trade_no: 'ORDER_PRIVATE', trade_no: 'ALI_PRIVATE' } }),
    })
    vi.stubGlobal('fetch', fetchSpy)
    const result = await createAlipayProvider(alipayConfig).createOrder({
      orderNo: 'ORDER_PRIVATE',
      amount: 100,
      description: 'private buyer description',
      tradeType: 'jsapi',
      notifyUrl: 'https://example.invalid/private/notify',
    })
    expect(result.success).toBe(true)
    const [url, options] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://openapi.alipay.com/gateway.do')
    expect(new URL(url).search).toBe('')
    const body = new URLSearchParams(options.body)
    expect(body.get('timestamp')).toBe('2026-10-22 08:00:00')
    expect(body.get('biz_content')).toContain('ORDER_PRIVATE')
    expect(body.get('sign')).toBeTruthy()
    expect(formatAlipayTime(now)).toBe('2026-10-22 08:00:00')
  })
})

describe('wechat notification security', () => {
  it.each([{ appid: 'OTHER_APP' }, { mchid: 'OTHER_MERCHANT' }])('有效签名和解密但商户错误时拒绝：%j', async (resource) => {
    expect(await createWechatPayProvider(wechatConfig).handleNotify(wechatRequest({ resource })))
      .toMatchObject({ success: false, error: { code: HaiPaymentError.NOTIFY_VERIFY_FAILED.code } })
  })

  it.each(['', '1700000000abc', '1e9', '01700000000', String(now.getTime() / 1000 - 301), String(now.getTime() / 1000 + 301)])(
    '有效签名但时间戳 %s 不合法/过期时拒绝',
    async (timestamp) => {
      expect(await createWechatPayProvider(wechatConfig).handleNotify(wechatRequest({ timestamp })))
        .toMatchObject({ success: false, error: { code: HaiPaymentError.NOTIFY_VERIFY_FAILED.code } })
    },
  )

  it('精确 serial 选择新旧公钥，未知 serial 不尝试其它密钥', async () => {
    const provider = createWechatPayProvider(wechatConfig)
    expect((await provider.handleNotify(wechatRequest())).success).toBe(true)
    expect((await provider.handleNotify(wechatRequest({ serial: 'PUB_KEY_ID_2', privateKey: rotatedPair.privateKey }))).success).toBe(true)
    expect((await provider.handleNotify(wechatRequest({ serial: 'UNKNOWN_SERIAL' }))).success).toBe(false)
    expect((await provider.handleNotify(wechatRequest({ serial: 'PUB_KEY_ID_2' }))).success).toBe(false)
  })

  it('真实证书验签成功；证书自身序列号不符和过期证书拒绝', async () => {
    const certificate = testCertificate(1)
    const serial = new X509Certificate(certificate).serialNumber
    expect((await createWechatPayProvider({ ...wechatConfig, platformKeys: { [serial]: certificate } })
      .handleNotify(wechatRequest({ serial }))).success).toBe(true)
    expect((await createWechatPayProvider({ ...wechatConfig, platformKeys: { WRONG_SERIAL: certificate } })
      .handleNotify(wechatRequest({ serial: 'WRONG_SERIAL' }))).success).toBe(false)
    const expired = testCertificate(2, '210101000000Z')
    const expiredSerial = new X509Certificate(expired).serialNumber
    expect((await createWechatPayProvider({ ...wechatConfig, platformKeys: { [expiredSerial]: expired } })
      .handleNotify(wechatRequest({ serial: expiredSerial }))).success).toBe(false)
  })

  it('通知事件时间可以很早，签名时间必须新鲜；返回事件 ID 与币种', async () => {
    expect(await createWechatPayProvider(wechatConfig).handleNotify(wechatRequest()))
      .toMatchObject({ success: true, data: { eventId: 'WX_EVENT', currency: 'CNY', status: 'paid' } })
  })

  it('缺少或重复大小写形式的签名头时拒绝', async () => {
    const missing = wechatRequest()
    delete (missing.headers as Record<string, string>)['Wechatpay-Serial']
    expect((await createWechatPayProvider(wechatConfig).handleNotify(missing)).success).toBe(false)
    const duplicated = wechatRequest()
    Object.assign(duplicated.headers, { 'wechatpay-timestamp': duplicated.headers['Wechatpay-Timestamp'] })
    expect((await createWechatPayProvider(wechatConfig).handleNotify(duplicated)).success).toBe(false)
  })

  it.each([{ id: '' }, { create_time: '2026-02-30T00:00:00Z' }, { event_type: 'REFUND.SUCCESS' }, { resource: {} }])(
    '拒绝畸形/非支付成功 envelope：%j',
    async (envelope) => {
      expect((await createWechatPayProvider(wechatConfig).handleNotify(wechatRequest({ envelope }))).success).toBe(false)
    },
  )
  it.each([{ amount: { total: -1, currency: 'CNY' } }, { success_time: '2026-02-30T00:00:00Z' }, { trade_state: 'PAYERROR' }])(
    '拒绝非法解密资源：%j',
    async (resource) => {
      expect((await createWechatPayProvider(wechatConfig).handleNotify(wechatRequest({ resource }))).success).toBe(false)
    },
  )
})

describe('stripe notification security', () => {
  const config = { secretKey: 'sk_test_notify_security', webhookSecret: 'whsec_security', successUrl: 'https://example.invalid/success' }
  const event = {
    id: 'evt_security',
    created: 1_700_000_000,
    livemode: false,
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_security', object: 'checkout.session', mode: 'payment', metadata: { orderNo: 'ORDER_SECURITY' }, amount_total: 100, currency: 'usd', payment_status: 'paid' } },
  }

  /** 按指定时间串签名，以证明拒绝畸形时间并非签名不匹配。 */
  function request(overrides: Record<string, unknown> = {}, timestamp = String(now.getTime() / 1000)) {
    const body = JSON.stringify({ ...event, ...overrides })
    const signature = createHmac('sha256', config.webhookSecret).update(`${timestamp}.${body}`).digest('hex')
    return { body, headers: { 'Stripe-Signature': `t=${timestamp},v1=${signature}` } }
  }

  it.each([{ livemode: true }, { account: 'acct_other' }, { context: 'acct_other' }])('有效签名但其它模式/账户事件拒绝：%j', async (fields) => {
    expect((await createStripeProvider(config).handleNotify(request(fields))).success).toBe(false)
  })
  it.each(['', `${now.getTime() / 1000}abc`, String(now.getTime() / 1000 - 301)])('拒绝畸形/过期签名时间 %s', async (timestamp) => {
    expect((await createStripeProvider(config).handleNotify(request({}, timestamp))).success).toBe(false)
  })
  it('密钥轮换的多 v1 签名可匹配当前密钥；重复 t 拒绝', async () => {
    const valid = request()
    valid.headers['Stripe-Signature'] = valid.headers['Stripe-Signature'].replace(',v1=', `,v1=${'0'.repeat(64)},v1=`)
    expect((await createStripeProvider(config).handleNotify(valid)).success).toBe(true)
    valid.headers['Stripe-Signature'] += `,t=${now.getTime() / 1000}`
    expect((await createStripeProvider(config).handleNotify(valid)).success).toBe(false)
  })
})
