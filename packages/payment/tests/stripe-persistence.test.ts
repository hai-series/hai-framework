/** Stripe 持久映射、幂等键和未知结果恢复：真实 SQLite + 渠道 HTTP 替身。 */
import type { CreateOrderInput } from '../src/payment-types'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { reldb } from '@h-ai/reldb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStripeProvider } from '../src/providers/stripe/payment-provider-stripe'
import { StripeOperationRepository } from '../src/providers/stripe/payment-stripe-repository-operation'

const config = { successUrl: 'https://example.invalid/payment/success', secretKey: 'sk_test_key', webhookSecret: 'whsec_key', webhookToleranceSeconds: 300 }
const orderInput: CreateOrderInput = {
  orderNo: 'ORDER-1',
  amount: 100,
  currency: 'USD',
  description: 'Test',
  tradeType: 'h5',
  notifyUrl: 'https://example.invalid/notify',
}

/** 测试渠道状态；仅测试使用内存模拟 Stripe 的幂等层。 */
interface TestSession {
  id: string
  url: string
  metadata: { orderNo: string }
  amount_total: number
  currency: string
  payment_status: 'paid' | 'unpaid'
  payment_intent: string | null
  status: 'open' | 'complete' | 'expired'
}

describe('stripe persistent operations', () => {
  let directory: string
  let database: string
  let repository: StripeOperationRepository
  let sessions: Map<string, TestSession>
  let outcomes: Map<string, unknown>
  let loseResponse: Set<string>
  let createdOrders: number
  let createdRefunds: number
  let fetchMock: ReturnType<typeof vi.fn<(url: string, options: RequestInit) => Promise<Response>>>

  beforeEach(async () => {
    const temporaryRoot = path.resolve(import.meta.dirname, '../../../tmp')
    await mkdir(temporaryRoot, { recursive: true })
    directory = await mkdtemp(path.join(temporaryRoot, 'stripe-persistence-'))
    database = path.join(directory, 'operations.sqlite')
    const initialized = await reldb.init({ type: 'sqlite', database })
    if (!initialized.success)
      throw new Error(initialized.error.message)
    repository = new StripeOperationRepository(reldb)
    const ready = await repository.initialize()
    if (!ready.success)
      throw new Error(ready.error.message)
    sessions = new Map()
    outcomes = new Map()
    loseResponse = new Set()
    createdOrders = 0
    createdRefunds = 0

    fetchMock = vi.fn(async (url: string, options: RequestInit) => {
      const pathname = new URL(url).pathname
      if (pathname === '/v1/account')
        return Response.json({ id: 'acct_test_account' })
      if (options.method === 'GET') {
        const id = decodeURIComponent(pathname.slice('/v1/checkout/sessions/'.length))
        const session = sessions.get(id)
        if (!session)
          throw new Error('Session not found')
        return Response.json(session)
      }
      if (pathname.endsWith('/expire')) {
        const id = pathname.slice('/v1/checkout/sessions/'.length, -'/expire'.length)
        const session = sessions.get(id)
        if (!session || session.status !== 'open')
          return Response.json({ error: 'Session is not open' }, { status: 400 })
        session.status = 'expired'
        if (loseResponse.delete('close'))
          throw new Error('Simulated expiration response loss')
        return Response.json(session)
      }
      const key = new Headers(options.headers).get('Idempotency-Key')
      if (!key || typeof options.body !== 'string')
        throw new Error('POST must carry an idempotency key and form body')
      const body = new URLSearchParams(options.body)
      const kind = pathname === '/v1/refunds' ? 'refund' : 'order'
      if (!outcomes.has(key)) {
        if (kind === 'order') {
          const id = `cs_${++createdOrders}`
          const session: TestSession = {
            id,
            url: `https://checkout.stripe.com/pay/${id}`,
            metadata: { orderNo: body.get('metadata[orderNo]') ?? '' },
            amount_total: Number(body.get('line_items[0][price_data][unit_amount]')),
            currency: body.get('line_items[0][price_data][currency]') ?? '',
            payment_status: 'unpaid',
            payment_intent: null,
            status: 'open',
          }
          sessions.set(id, session)
          outcomes.set(key, structuredClone(session))
        }
        else {
          outcomes.set(key, { id: `re_${++createdRefunds}`, status: 'succeeded' })
        }
      }
      if (loseResponse.delete(kind))
        throw new Error('Simulated response loss after external execution')
      return Response.json(outcomes.get(key))
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    await reldb.close()
    if (directory)
      await rm(directory, { recursive: true, force: true })
  })

  /** 为退款准备渠道已付款状态，持久 Session 映射仍保持创建时的结果。 */
  async function paidOrder() {
    const created = await createStripeProvider(config, repository).createOrder(orderInput)
    expect(created.success).toBe(true)
    const session = sessions.get('cs_1')
    if (!session)
      throw new Error('Test order was not created')
    session.payment_status = 'paid'
    session.payment_intent = 'pi_order_1'
    session.status = 'complete'
  }

  it('两个 Provider 并发创建同订单只产生一个渠道订单', async () => {
    const results = await Promise.all([
      createStripeProvider(config, repository).createOrder(orderInput),
      createStripeProvider(config, new StripeOperationRepository(reldb)).createOrder(orderInput),
    ])
    expect(results.every(result => result.success)).toBe(true)
    expect(results[0]).toEqual(results[1])
    expect(createdOrders).toBe(1)
  })

  it('响应丢失后复用原幂等键，第二实例不会再创建订单', async () => {
    loseResponse.add('order')
    expect((await createStripeProvider(config, repository).createOrder(orderInput)).success).toBe(false)
    expect((await createStripeProvider(config, repository).createOrder(orderInput)).success).toBe(true)
    expect(createdOrders).toBe(1)
    const posts = fetchMock.mock.calls.filter(([, options]) => options.method === 'POST')
    expect(new Headers(posts[0][1].headers).get('Idempotency-Key')).toBe(new Headers(posts[1][1].headers).get('Idempotency-Key'))
  })

  it('数据库结果提交失败不能返回成功，重试仍沿用外部操作', async () => {
    vi.spyOn(repository, 'complete').mockRejectedValueOnce(new Error('DB write failed'))
    expect((await createStripeProvider(config, repository).createOrder(orderInput)).success).toBe(false)
    expect((await createStripeProvider(config, repository).createOrder(orderInput)).success).toBe(true)
    expect(createdOrders).toBe(1)
  })

  it('重开数据库并轮换密钥后仍按持久 Session ID 查指定订单', async () => {
    await paidOrder()
    await reldb.close()
    const reopened = await reldb.init({ type: 'sqlite', database })
    expect(reopened.success).toBe(true)
    const provider = createStripeProvider({ ...config, secretKey: 'sk_test_rotated' })
    const result = await provider.queryOrder(orderInput.orderNo)
    expect(result.success).toBe(true)
    if (result.success)
      expect(result.data).toMatchObject({ orderNo: orderInput.orderNo, transactionId: 'cs_1', status: 'paid' })
    expect(fetchMock.mock.calls.some(([url]) => new URL(url).search.length > 0)).toBe(false)
    const mapping = await reldb.sql.get<{ payment_intent: string }>('SELECT payment_intent FROM hai_payment_stripe_operations')
    expect(mapping.success && mapping.data?.payment_intent).toBe('pi_order_1')
  })

  it('不同订单的渠道映射不会相互混用', async () => {
    const provider = createStripeProvider(config, repository)
    await provider.createOrder(orderInput)
    await provider.createOrder({ ...orderInput, orderNo: 'ORDER-2', amount: 300 })
    const result = await provider.queryOrder('ORDER-2')
    expect(result.success).toBe(true)
    if (result.success)
      expect(result.data).toMatchObject({ transactionId: 'cs_2', amount: 300 })
  })

  it('同一订单号改变请求参数时拒绝创建', async () => {
    const provider = createStripeProvider(config, repository)
    await provider.createOrder(orderInput)
    expect((await provider.createOrder({ ...orderInput, amount: 200 })).success).toBe(false)
    expect(createdOrders).toBe(1)
  })

  it('metadata 不得覆盖订单号', async () => {
    const result = await createStripeProvider(config, repository).createOrder({ ...orderInput, metadata: { orderNo: 'OTHER' } })
    expect(result.success).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('安全重试窗口之后的未知结果不重新发送', async () => {
    loseResponse.add('order')
    const provider = createStripeProvider(config, repository)
    await provider.createOrder(orderInput)
    await reldb.sql.execute('UPDATE hai_payment_stripe_operations SET created_at = 0')
    const postsBefore = fetchMock.mock.calls.filter(([, options]) => options.method === 'POST').length
    expect((await provider.createOrder(orderInput)).success).toBe(false)
    expect(fetchMock.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(postsBefore)
  })

  it('渠道返回错误订单号或金额时查单失败', async () => {
    const provider = createStripeProvider(config, repository)
    await provider.createOrder(orderInput)
    const session = sessions.get('cs_1')!
    session.metadata.orderNo = 'OTHER'
    expect((await provider.queryOrder(orderInput.orderNo)).success).toBe(false)
    session.metadata.orderNo = orderInput.orderNo
    session.amount_total++
    expect((await provider.queryOrder(orderInput.orderNo)).success).toBe(false)
  })

  it('同 refundNo 在两个实例并发退款只执行一次渠道副作用', async () => {
    await paidOrder()
    const refund = { orderNo: orderInput.orderNo, refundNo: 'REFUND-1', amount: 50 }
    const results = await Promise.all([
      createStripeProvider(config, repository).refund(refund),
      createStripeProvider(config, new StripeOperationRepository(reldb)).refund(refund),
    ])
    expect(results.every(result => result.success)).toBe(true)
    expect(results[0]).toEqual(results[1])
    expect(createdRefunds).toBe(1)
  })

  it('退款响应丢失可在新实例安全恢复，参数改变被拒绝', async () => {
    await paidOrder()
    loseResponse.add('refund')
    const refund = { orderNo: orderInput.orderNo, refundNo: 'REFUND-1', amount: 50, reason: 'Test refund' }
    expect((await createStripeProvider(config, repository).refund(refund)).success).toBe(false)
    expect((await createStripeProvider(config, repository).refund(refund)).success).toBe(true)
    expect((await createStripeProvider(config, repository).refund({ ...refund, amount: 60 })).success).toBe(false)
    expect(createdRefunds).toBe(1)
  })

  it('主动关单调用可信 Session expire，重复关闭通过已过期状态确认', async () => {
    const provider = createStripeProvider(config, repository)
    await provider.createOrder(orderInput)
    expect((await provider.closeOrder(orderInput.orderNo)).success).toBe(true)
    expect(sessions.get('cs_1')?.status).toBe('expired')
    expect((await provider.closeOrder(orderInput.orderNo)).success).toBe(true)
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/expire'))).toHaveLength(1)
    const status = await provider.queryOrder(orderInput.orderNo)
    expect(status.success && status.data.status).toBe('closed')
  })

  it('已付款/已完成 Session 不能关闭', async () => {
    await paidOrder()
    expect((await createStripeProvider(config, repository).closeOrder(orderInput.orderNo)).success).toBe(false)
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/expire'))).toBe(false)
  })

  it('两个实例并发关单只在真实过期确认后幂等成功', async () => {
    await createStripeProvider(config, repository).createOrder(orderInput)
    const results = await Promise.all([
      createStripeProvider(config, repository).closeOrder(orderInput.orderNo),
      createStripeProvider(config, repository).closeOrder(orderInput.orderNo),
    ])
    expect(results.every(result => result.success)).toBe(true)
    expect(sessions.get('cs_1')?.status).toBe('expired')
  })

  it('expire 响应丢失后重读确认，不能仅凭发送过请求就成功', async () => {
    const provider = createStripeProvider(config, repository)
    await provider.createOrder(orderInput)
    loseResponse.add('close')
    expect((await provider.closeOrder(orderInput.orderNo)).success).toBe(true)
    expect(sessions.get('cs_1')?.status).toBe('expired')
  })

  it('渠道过期失败且重读仍为 open 时返回失败', async () => {
    const provider = createStripeProvider(config, repository)
    await provider.createOrder(orderInput)
    const implementation = fetchMock.getMockImplementation()
    if (!implementation)
      throw new Error('Missing test channel implementation')
    fetchMock.mockImplementation((url: string, options: RequestInit) => url.endsWith('/expire')
      ? Promise.resolve(Response.json({ error: 'Channel unavailable' }, { status: 500 }))
      : implementation(url, options))
    expect((await provider.closeOrder(orderInput.orderNo)).success).toBe(false)
    expect(sessions.get('cs_1')?.status).toBe('open')
  })
})
