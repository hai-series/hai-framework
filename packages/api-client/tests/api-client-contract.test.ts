/**
 * @h-ai/api-client — 契约调用测试
 */

import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineEndpoint } from '../src/api-client-types.js'
import { createApiClient, createMemoryTokenStorage } from '../src/index.js'

/** 模拟登录端点契约 */
const loginEndpoint = defineEndpoint({
  method: 'POST',
  path: '/auth/login',
  input: z.object({
    identifier: z.string().min(1),
    password: z.string().min(1),
  }),
  output: z.object({
    user: z.object({ id: z.string(), name: z.string() }),
    tokens: z.object({
      accessToken: z.string(),
      refreshToken: z.string(),
      expiresIn: z.number(),
      tokenType: z.literal('Bearer'),
    }),
  }),
  requireAuth: false,
})

/** 模拟用户列表端点（GET） */
const listUsersEndpoint = defineEndpoint({
  method: 'GET',
  path: '/users',
  input: z.object({
    page: z.number().optional(),
    pageSize: z.number().optional(),
  }),
  output: z.array(z.object({ id: z.string(), name: z.string() })),
})

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ data: body }), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  )
}

describe('api.call (contract)', () => {
  it('pOST 契约调用成功', async () => {
    const responseData = {
      user: { id: 'u1', name: 'Alice' },
      tokens: { accessToken: 'at', refreshToken: 'rt', expiresIn: 3600, tokenType: 'Bearer' },
    }
    const fetch = mockFetch(200, responseData)
    const api = createApiClient({ baseUrl: 'https://api.test.com', fetch })

    const result = await api.call(loginEndpoint, { identifier: 'alice', password: 'pass' })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.user.name).toBe('Alice')
    }
    expect(fetch).toHaveBeenCalledWith(
      'https://api.test.com/auth/login',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('gET 契约调用附加 query 参数', async () => {
    const fetch = mockFetch(200, [{ id: 'u1', name: 'Alice' }])
    const api = createApiClient({ baseUrl: 'https://api.test.com', fetch })

    await api.call(listUsersEndpoint, { page: 1, pageSize: 20 })

    const url = (fetch.mock.calls[0] as string[])[0]
    expect(url).toContain('page=1')
    expect(url).toContain('pageSize=20')
  })

  it('入参校验失败返回 VALIDATION_FAILED', async () => {
    const fetch = mockFetch(200, {})
    const api = createApiClient({ baseUrl: 'https://api.test.com', fetch })

    // identifier 为空字符串不满足 min(1)
    const result = await api.call(loginEndpoint, { identifier: '', password: 'pass' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(6006) // VALIDATION_FAILED
    }
    // fetch 不应被调用
    expect(fetch).not.toHaveBeenCalled()
  })

  it('token 自动附加到请求头', async () => {
    const fetch = mockFetch(200, { data: [] })
    const storage = createMemoryTokenStorage()
    await storage.setAccessToken('my-token-123')

    const api = createApiClient({
      baseUrl: 'https://api.test.com',
      fetch,
      auth: { storage, refreshUrl: '/auth/refresh' },
    })

    await api.get('/protected')

    const headers = (fetch.mock.calls[0] as { headers: Record<string, string> }[])[1]?.headers
    expect(headers).toHaveProperty('Authorization', 'Bearer my-token-123')
  })
})
