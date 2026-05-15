import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  aiContract,
  createApiContract,
  haiResultSchema,
  HaiVoidResultSchema,
  IamLoginInputSchema,
  IamRefreshTokenOutputSchema,
  paginatedSchema,
  PaginationQuerySchema,
  paymentContract,
  PaymentCreateOrderInputSchema,
  storageContract,
} from '../src/index.js'
import { apiServiceContract } from '../src/presets/api-service-contract.js'

describe('@h-ai/api-contract', () => {
  it('createApiContract 过滤未启用领域', () => {
    const contract = createApiContract({
      ai: aiContract,
      storage: false,
      payment: undefined,
    })

    expect('ai' in contract).toBe(true)
    expect('storage' in contract).toBe(false)
    expect('payment' in contract).toBe(false)
  })

  it('apiServiceContract 默认启用 iam/storage/ai', () => {
    expect(apiServiceContract.iam.auth.login).toBeDefined()
    expect(apiServiceContract.storage.files.list).toBeDefined()
    expect(apiServiceContract.ai.chats.createCompletion).toBeDefined()
    expect('payment' in apiServiceContract).toBe(false)
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
  })

  it('storage 和 payment contract 使用明确 OpenAPI 路由', () => {
    expect(routeOf(storageContract.presignedUrls.createDownload)).toEqual({
      method: 'POST',
      path: '/storage/presigned-urls/download',
    })
    expect(routeOf(paymentContract.orders.create)).toEqual({
      method: 'POST',
      path: '/payment/orders',
    })
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

  it('haiResultSchema 形成 success/error 区分联合', () => {
    const schema = haiResultSchema(z.object({ id: z.string() }))

    expect(schema.safeParse({ success: true, data: { id: 'u1' } }).success).toBe(true)
    expect(schema.safeParse({
      success: false,
      error: { code: 'iam:001:401', message: 'unauthorized' },
    }).success).toBe(true)

    expect(schema.safeParse({ success: true }).success).toBe(false)
    expect(schema.safeParse({ success: false }).success).toBe(false)
    expect(schema.safeParse({ success: true, data: { id: 1 } }).success).toBe(false)
  })

  it('haiVoidResultSchema 接受 success+undefined data', () => {
    expect(HaiVoidResultSchema.safeParse({ success: true, data: undefined }).success).toBe(true)
  })

  it('paginatedSchema 校验列表结构与计数', () => {
    const schema = paginatedSchema(z.object({ id: z.string() }))
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
    expect(routeOf(storageContract.files.delete)).toMatchObject({ method: 'DELETE' })
    expect(routeOf(storageContract.files.list)).toMatchObject({ method: 'GET' })
    expect(routeOf(apiServiceContract.ai.chats.createCompletion)).toMatchObject({
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
