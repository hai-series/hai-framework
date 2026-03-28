/**
 * @h-ai/api-client — 契约调用测试
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineEndpoint, HaiApiClientError } from '../src/api-client-types.js'
import { api, createMemoryTokenStorage } from '../src/index.js'

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
  afterEach(async () => {
    await api.close()
  })

  it('pOST 契约调用成功', async () => {
    const responseData = {
      user: { id: 'u1', name: 'Alice' },
      tokens: { accessToken: 'at', refreshToken: 'rt', expiresIn: 3600, tokenType: 'Bearer' },
    }
    const fetch = mockFetch(200, responseData)
    await api.init({ baseUrl: 'https://api.test.com', fetch })

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
    await api.init({ baseUrl: 'https://api.test.com', fetch })

    await api.call(listUsersEndpoint, { page: 1, pageSize: 20 })

    const url = (fetch.mock.calls[0] as string[])[0]
    expect(url).toContain('page=1')
    expect(url).toContain('pageSize=20')
  })

  it('入参校验失败返回 VALIDATION_FAILED', async () => {
    const fetch = mockFetch(200, {})
    await api.init({ baseUrl: 'https://api.test.com', fetch })

    // identifier 为空字符串不满足 min(1)
    const result = await api.call(loginEndpoint, { identifier: '', password: 'pass' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiApiClientError.VALIDATION_FAILED.code)
    }
    // fetch 不应被调用
    expect(fetch).not.toHaveBeenCalled()
  })

  it('响应数据不符合 output schema 时返回 VALIDATION_FAILED', async () => {
    // 服务端返回的数据缺少 tokens 字段，不满足 loginEndpoint.output
    const fetch = mockFetch(200, { user: { id: 'u1', name: 'Alice' } })
    await api.init({ baseUrl: 'https://api.test.com', fetch })

    const result = await api.call(loginEndpoint, { identifier: 'alice', password: 'pass' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiApiClientError.VALIDATION_FAILED.code)
      expect(result.error.cause).toBeDefined()
    }
  })

  it('token 自动附加到请求头', async () => {
    const fetch = mockFetch(200, { data: [] })
    const storage = createMemoryTokenStorage()
    await storage.setAccessToken('my-token-123')

    await api.init({
      baseUrl: 'https://api.test.com',
      fetch,
      auth: { storage, refreshUrl: '/auth/refresh' },
    })

    await api.get('/protected')

    const headers = (fetch.mock.calls[0] as { headers: Record<string, string> }[])[1]?.headers
    expect(headers).toHaveProperty('Authorization', 'Bearer my-token-123')
  })

  it('dELETE 契约调用传递 query 参数', async () => {
    const deleteEndpoint = defineEndpoint({
      method: 'DELETE',
      path: '/users',
      input: z.object({ id: z.string() }),
      output: z.object({ success: z.boolean() }),
    })

    const fetch = mockFetch(200, { success: true })
    await api.init({ baseUrl: 'https://api.test.com', fetch })

    await api.call(deleteEndpoint, { id: 'u1' })

    const url = (fetch.mock.calls[0] as string[])[0]
    expect(url).toContain('id=u1')
  })

  it('auth 未传 storage 时默认使用 localStorage', async () => {
    const storageData: Record<string, string> = {}
    const localStorageMock = {
      getItem: vi.fn((key: string) => storageData[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        storageData[key] = value
      }),
      removeItem: vi.fn((key: string) => {
        delete storageData[key]
      }),
    }

    const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: localStorageMock,
    })

    try {
      const fetch = mockFetch(200, { ok: true })
      await api.init({
        baseUrl: 'https://api.test.com',
        fetch,
        auth: { refreshUrl: '/auth/refresh' },
      })

      await api.auth.setTokens({
        accessToken: 'default-at',
        refreshToken: 'default-rt',
        expiresIn: 3600,
        tokenType: 'Bearer',
      })

      await api.get('/protected')

      expect(localStorageMock.setItem).toHaveBeenCalledWith('hai_access_token', 'default-at')
      expect(localStorageMock.setItem).toHaveBeenCalledWith('hai_refresh_token', 'default-rt')

      const headers = (fetch.mock.calls[0] as { headers: Record<string, string> }[])[1]?.headers
      expect(headers).toHaveProperty('Authorization', 'Bearer default-at')
    }
    finally {
      if (originalLocalStorage) {
        Object.defineProperty(globalThis, 'localStorage', originalLocalStorage)
      }
      else {
        Reflect.deleteProperty(globalThis, 'localStorage')
      }
    }
  })
})
