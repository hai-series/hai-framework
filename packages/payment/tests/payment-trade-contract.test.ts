// @vitest-environment jsdom
/** 服务端真实 RSA 签名与真实 DOM 表单消费的协议回归；不代表商户/设备支付验收。 */
import type { PaymentOrder } from '../src/payment-types'
import { createVerify, generateKeyPairSync } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { invokePayment } from '../src/client/payment-client-web'
import { AlipayConfigSchema, WechatPayConfigSchema } from '../src/payment-config'
import { HaiPaymentError } from '../src/payment-types'
import { createAlipayProvider } from '../src/providers/alipay/payment-provider-alipay'
import { createWechatPayProvider } from '../src/providers/wechat/payment-provider-wechat'

const pair = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})
const alipay = AlipayConfigSchema.parse({
  appId: 'test-app',
  sellerId: 'test-seller',
  privateKey: pair.privateKey,
  alipayPublicKey: pair.publicKey,
  returnUrl: 'https://shop.example/paid',
})
const wechat = WechatPayConfigSchema.parse({
  mchId: 'test-merchant',
  appId: 'wx-test-app',
  privateKey: pair.privateKey,
  apiV3Key: '0123456789abcdef0123456789abcdef',
  serialNo: 'TEST_SERIAL',
  platformKeys: { TEST_SERIAL: pair.publicKey },
})
const input = { orderNo: 'ORDER_PAGE_001', amount: 123, description: '商品', tradeType: 'h5' as const, notifyUrl: 'https://shop.example/notify' }

/** 显式验证运行时返回的 fields；不使用空对象断言绕过形状检查。 */
function pageFields(order: PaymentOrder): Record<string, string> {
  const fields = order.clientParams.fields
  if (!fields || typeof fields !== 'object')
    throw new Error('Missing page fields')
  const entries = Object.entries(fields) as Array<[string, unknown]>
  for (const [, value] of entries) {
    if (typeof value !== 'string')
      throw new Error('Non-string page field')
  }
  return Object.fromEntries(entries) as Record<string, string>
}

async function pageOrder(): Promise<PaymentOrder> {
  const result = await createAlipayProvider(alipay).createOrder(input)
  if (!result.success)
    throw new Error(result.error.message)
  return result.data
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(window, 'WeixinJSBridge')
  document.body.replaceChildren()
})

describe('complete payment trade contracts', () => {
  it('支付宝页面协议完整签名，经 DOM 原样 POST 到固定网关；敏感内容不在 action URL', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const description = '"/><script>globalThis.paymentInjected = true</script>'
    const metadata = { campaign: '中文 & + % /' }
    const result = await createAlipayProvider(alipay).createOrder({ ...input, description, metadata })
    if (!result.success)
      throw new Error(result.error.message)
    const fields = pageFields(result.data)
    expect(Object.keys(fields).sort()).toEqual(['app_id', 'biz_content', 'charset', 'format', 'method', 'notify_url', 'return_url', 'sign', 'sign_type', 'timestamp', 'version'])
    expect(fields.method).toBe('alipay.trade.wap.pay')
    expect(fields.return_url).toBe(alipay.returnUrl)
    const business = JSON.parse(fields.biz_content)
    expect(business).toMatchObject({ out_trade_no: input.orderNo, total_amount: '1.23', product_code: 'QUICK_WAP_WAY', subject: description })
    expect(JSON.parse(decodeURIComponent(business.passback_params))).toEqual(metadata)
    const content = Object.keys(fields).filter(key => key !== 'sign').sort().map(key => `${key}=${fields[key]}`).join('&')
    expect(createVerify('RSA-SHA256').update(content).verify(pair.publicKey, fields.sign, 'base64')).toBe(true)

    const submitted: Array<{ action: string, method: string, fields: Record<string, FormDataEntryValue> }> = []
    vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(function (this: HTMLFormElement) {
      submitted.push({ action: this.action, method: this.method, fields: Object.fromEntries(new FormData(this)) })
      expect(document.querySelector('script')).toBeNull()
    })
    const invocation = await invokePayment(result.data)
    expect(invocation.success && invocation.data.invoked).toBe(true)
    expect(submitted).toEqual([{ action: 'https://openapi.alipay.com/gateway.do', method: 'post', fields }])
    expect(document.querySelector('form')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([
    'https://attacker.example/post',
    'https://openapi.alipay.com.evil.example/gateway.do',
    'https://openapi.alipay.com/gateway.do?order=secret',
    'javascript:alert(1)',
  ])('拒绝任意或被污染的 action %s', async (gateway) => {
    const order = await pageOrder()
    order.clientParams.gateway = gateway
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit')
    expect(await invokePayment(order)).toMatchObject({ success: false, error: { code: HaiPaymentError.INVOKE_WEB_FAILED.code } })
    expect(submit).not.toHaveBeenCalled()
    expect(document.querySelector('form')).toBeNull()
  })

  it.each(['submit', 'action', '__proto__', 'unknown'])('拒绝未声明的表单字段 %s', async (key) => {
    const order = await pageOrder()
    order.clientParams.fields = { ...pageFields(order), [key]: 'pollution' }
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit')
    expect((await invokePayment(order)).success).toBe(false)
    expect(submit).not.toHaveBeenCalled()
  })

  it.each(['missing', 'non-string', 'wrong-method', 'raw-html'])('不接受畸形页面参数 %s', async (variant) => {
    const order = await pageOrder()
    const fields: Record<string, unknown> = pageFields(order)
    if (variant === 'missing')
      delete fields.sign
    if (variant === 'non-string')
      fields.sign = 1
    if (variant === 'wrong-method')
      fields.method = 'alipay.trade.app.pay'
    if (variant === 'raw-html')
      order.clientParams.form = '<form action="https://attacker.example"></form>'
    order.clientParams.fields = fields
    expect((await invokePayment(order)).success).toBe(false)
  })

  it('表单提交抛错时返回失败并清理 DOM', async () => {
    vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {
      throw new Error('Blocked navigation')
    })
    expect((await invokePayment(await pageOrder())).success).toBe(false)
    expect(document.querySelector('form')).toBeNull()
  })

  it('微信下单必填 payer，生成签名后仅调起公众号 JSAPI，不把客户端回调当付款证明', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ prepay_id: 'wx_prepay_test' }) })
    vi.stubGlobal('fetch', fetch)
    const result = await createWechatPayProvider(wechat).createOrder({ ...input, tradeType: 'jsapi', userId: 'trusted-openid' })
    if (!result.success)
      throw new Error(result.error.message)
    expect(fetch.mock.calls[0][0]).toBe('https://api.mch.weixin.qq.com/v3/pay/transactions/jsapi')
    expect(JSON.parse(fetch.mock.calls[0][1].body).payer).toEqual({ openid: 'trusted-openid' })
    const params = result.data.clientParams
    const signatureInput = `${params.appId}\n${params.timeStamp}\n${params.nonceStr}\n${params.package}\n`
    expect(createVerify('RSA-SHA256').update(signatureInput).verify(pair.publicKey, String(params.paySign), 'base64')).toBe(true)
    const invoke = vi.fn((_api, _params, callback) => callback({ err_msg: 'get_brand_wcpay_request:cancel' }))
    Object.defineProperty(window, 'WeixinJSBridge', { configurable: true, value: { invoke } })
    const invocation = await invokePayment(result.data)
    expect(invoke).toHaveBeenCalledWith('getBrandWCPayRequest', params, expect.any(Function))
    expect(invocation).toMatchObject({ success: true, data: { invoked: true, message: 'get_brand_wcpay_request:cancel' } })
    expect(invocation).not.toHaveProperty('data.status')
  })

  it('桥接对象尚未就绪时 invoked=false；缺参数时返回错误', async () => {
    const params = { appId: 'wx-test', timeStamp: '1760000000', nonceStr: 'nonce', package: 'prepay_id=wx_test', signType: 'RSA', paySign: 'signature' }
    expect(await invokePayment({ provider: 'wechat', tradeType: 'jsapi', clientParams: params })).toMatchObject({ success: true, data: { invoked: false } })
    expect((await invokePayment({ provider: 'wechat', tradeType: 'jsapi', clientParams: {} })).success).toBe(false)
  })

  it.each([['wechat', 'h5'], ['alipay', 'jsapi'], ['stripe', 'jsapi'], ['wechat', 'app'], ['alipay', 'mini_program']])('客户端拒绝 %s/%s，不回落到其它方式', async (provider, tradeType) => {
    const order: PaymentOrder = { provider, tradeType: 'h5', clientParams: {} }
    Reflect.set(order, 'tradeType', tradeType)
    expect(await invokePayment(order)).toMatchObject({ success: false, error: { code: HaiPaymentError.UNSUPPORTED_TRADE_TYPE.code } })
  })

  it.each(['javascript:alert(1)', 'file:///paid', 'https://user:password@checkout.stripe.com/pay/session'])('stripe 拒绝不安全跳转地址 %s', async (checkoutUrl) => {
    expect((await invokePayment({ provider: 'stripe', tradeType: 'h5', clientParams: { checkoutUrl } })).success).toBe(false)
  })

  it.each([undefined, '', 'http://shop.example/paid', 'javascript:alert(1)'])('支付宝必填可信 HTTPS returnUrl=%s', (returnUrl) => {
    expect(AlipayConfigSchema.safeParse({ ...alipay, returnUrl }).success).toBe(false)
  })
})
