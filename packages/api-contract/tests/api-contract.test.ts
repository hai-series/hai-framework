import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  apiContract,
  IamLoginInputSchema,
  IamRefreshTokenOutputSchema,
  PaginationQuerySchema,
  PaymentCreateOrderInputSchema,
} from '../src/index.js'

describe('@h-ai/api-contract', () => {
  it('apiContract.create 过滤未启用领域', () => {
    const contract = apiContract.create({
      ai: apiContract.ai,
      storage: false,
      payment: undefined,
    })

    expect('ai' in contract).toBe(true)
    expect('storage' in contract).toBe(false)
    expect('payment' in contract).toBe(false)
  })

  it('apiContract.create 启用 iam/storage/ai 三个领域', () => {
    const contract = apiContract.create({ iam: apiContract.iam, storage: apiContract.storage, ai: apiContract.ai })
    expect(contract.iam.auth.login).toBeDefined()
    expect(contract.storage.files.list).toBeDefined()
    expect(contract.ai.chats.createCompletion).toBeDefined()
    expect('payment' in contract).toBe(false)
  })

  it('iam 登录输入和刷新输出 Schema 可校验', () => {
    expect(IamLoginInputSchema.safeParse({ identifier: 'alice', password: 'password123' }).success).toBe(true)
    expect(IamLoginInputSchema.safeParse({ identifier: '', password: 'password123' }).success).toBe(false)

    const refreshOutput = IamRefreshTokenOutputSchema.safeParse({
      success: true,
      data: {
        tokens: {
          accessToken: 'access',
          refreshToken: 'refresh',
          expiresIn: 3600,
          tokenType: 'Bearer',
        },
      },
    })
    expect(refreshOutput.success).toBe(true)

    const cookieRefreshOutput = IamRefreshTokenOutputSchema.safeParse({
      success: true,
      data: {
        tokens: {
          accessToken: 'access',
          expiresIn: 3600,
          tokenType: 'Bearer',
        },
      },
    })
    expect(cookieRefreshOutput.success).toBe(true)
  })

  it('storage 和 payment contract 使用明确 OpenAPI 路由', () => {
    expect(routeOf(apiContract.storage.presignedUrls.createDownload)).toEqual({
      method: 'POST',
      path: '/storage/presigned-urls/download',
    })
    expect(routeOf(apiContract.payment.orders.create)).toEqual({
      method: 'POST',
      path: '/payment/orders',
    })
  })

  it('apiContract.route 可定义自定义 contract 路由', () => {
    const custom = apiContract
      .route({ method: 'POST', path: '/custom/ping', operationId: 'custom.ping', tags: ['custom'] })
      .output(apiContract.haiResultSchema(z.object({ pong: z.boolean() })))

    expect(routeOf(custom)).toEqual({ method: 'POST', path: '/custom/ping' })
  })

  it('payment 创建订单输入 Schema 可校验', () => {
    expect(PaymentCreateOrderInputSchema.safeParse({
      provider: 'wechat',
      amount: 100,
      description: '测试商品',
      tradeType: 'jsapi',
    }).success).toBe(true)

    expect(PaymentCreateOrderInputSchema.safeParse({
      provider: 'wechat',
      amount: 0,
      description: '测试商品',
      tradeType: 'jsapi',
    }).success).toBe(false)
  })

  it('apiContract.haiResultSchema 形成 success/error 区分联合', () => {
    const schema = apiContract.haiResultSchema(z.object({ id: z.string() }))

    expect(schema.safeParse({ success: true, data: { id: 'u1' } }).success).toBe(true)
    expect(schema.safeParse({
      success: false,
      error: { code: 'iam:001:401', message: 'unauthorized' },
    }).success).toBe(true)

    expect(schema.safeParse({ success: true }).success).toBe(false)
    expect(schema.safeParse({ success: false }).success).toBe(false)
    expect(schema.safeParse({ success: true, data: { id: 1 } }).success).toBe(false)
  })

  it('apiContract.voidResultSchema 接受 success+undefined data', () => {
    expect(apiContract.voidResultSchema.safeParse({ success: true, data: undefined }).success).toBe(true)
  })

  it('apiContract.paginatedSchema 校验列表结构与计数', () => {
    const schema = apiContract.paginatedSchema(z.object({ id: z.string() }))
    expect(schema.safeParse({
      items: [{ id: 'a' }],
      total: 1,
      page: 1,
      pageSize: 20,
    }).success).toBe(true)

    expect(schema.safeParse({
      items: [{ id: 1 }],
      total: 1,
      page: 1,
      pageSize: 20,
    }).success).toBe(false)
  })

  it('paginationQuerySchema 接受空对象并约束分页范围', () => {
    expect(PaginationQuerySchema.safeParse({}).success).toBe(true)
    expect(PaginationQuerySchema.safeParse({ page: 0 }).success).toBe(false)
    expect(PaginationQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false)
    expect(PaginationQuerySchema.safeParse({ page: '2', pageSize: '10' }).success).toBe(true)
  })

  it('storage / ai 关键路由暴露正确的 OpenAPI 方法', () => {
    expect(routeOf(apiContract.storage.files.delete)).toMatchObject({ method: 'DELETE' })
    expect(routeOf(apiContract.storage.files.list)).toMatchObject({ method: 'GET' })
    expect(routeOf(apiContract.ai.chats.createCompletion)).toMatchObject({
      method: 'POST',
      path: '/ai/chats/completions',
    })
  })
})

function routeOf(procedure: unknown): { method: string, path: string } {
  const contractProcedure = procedure as { '~orpc'?: { route?: { method?: string, path?: string } } }
  return {
    method: contractProcedure['~orpc']?.route?.method ?? '',
    path: contractProcedure['~orpc']?.route?.path ?? '',
  }
}
