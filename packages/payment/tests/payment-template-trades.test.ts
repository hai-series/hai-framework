/** 直接执行支付路由模板的校验和结果映射；完整生成工程门禁在所有任务后执行。 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '../../cli/templates/features/payment/routes/api/v1/payment/create/+server'

const { createOrder, mount } = vi.hoisted(() => ({ createOrder: vi.fn(), mount: { base: '' } }))
vi.mock('@h-ai/payment', () => ({ payment: { createOrder } }))
vi.mock('$app/paths', () => mount)

const valid = { provider: 'wechat', tradeType: 'jsapi', outTradeNo: 'ORDER_1', totalAmount: 100, subject: '商品', userId: 'openid-test' }

/** 本路由只读取request/locals；挂载目录由SvelteKit虚拟模块提供，其余事件字段不参与协议验证。 */
function event(body: unknown): Parameters<typeof POST>[0] {
  return {
    request: new Request('https://shop.example/api/v1/payment/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    locals: { requestId: 'request-trade-1' },
  } as Parameters<typeof POST>[0]
}

beforeEach(() => {
  mount.base = ''
  createOrder.mockReset()
  createOrder.mockResolvedValue({ success: true, data: { provider: 'wechat', tradeType: 'jsapi', clientParams: {} } })
})

describe('payment template trade validation', () => {
  it.each([
    { ...valid, tradeType: undefined },
    { ...valid, tradeType: 'app' },
    { ...valid, tradeType: 'h5' },
    { ...valid, tradeType: 'mini_program' },
    { ...valid, provider: 'alipay' },
    { ...valid, userId: '' },
    { ...valid, userId: undefined },
    { ...valid, totalAmount: '100' },
  ])('无效输入 %# 在调用 payment 前拒绝', async (body) => {
    await expect(POST(event(body))).rejects.toMatchObject({ status: 400 })
    expect(createOrder).not.toHaveBeenCalled()
  })

  it('保留明确 jsapi 和 openid，不进行场景回落', async () => {
    const response = await POST(event(valid))
    expect(response?.status).toBe(200)
    expect(createOrder).toHaveBeenCalledWith('wechat', {
      orderNo: 'ORDER_1',
      amount: 100,
      description: '商品',
      tradeType: 'jsapi',
      userId: 'openid-test',
      metadata: undefined,
      notifyUrl: 'https://shop.example/api/v1/payment/notify/wechat',
    })
  })

  it('默认支付回调包含SvelteKit目录，显式回调地址保持不变', async () => {
    mount.base = '/portal'
    await POST(event(valid))
    expect(createOrder.mock.calls[0][1].notifyUrl).toBe('https://shop.example/portal/api/v1/payment/notify/wechat')
    await POST(event({ ...valid, notifyUrl: 'https://notify.example/payments' }))
    expect(createOrder.mock.calls[1][1].notifyUrl).toBe('https://notify.example/payments')
  })

  it('支付宝 h5 不改变模式，调用失败按 HaiResult 返回', async () => {
    createOrder.mockResolvedValueOnce({ success: false, error: { code: 'hai:payment:042', message: 'Invalid input' } })
    const response = await POST(event({ ...valid, provider: 'alipay', tradeType: 'h5' }))
    expect(createOrder.mock.calls[0][1].tradeType).toBe('h5')
    expect(response?.status).toBe(400)
    expect(await response?.json()).toMatchObject({ success: false, error: { code: 'hai:payment:042' } })
  })
})
