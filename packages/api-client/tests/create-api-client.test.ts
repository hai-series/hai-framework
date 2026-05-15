import { haiResultSchema } from '@h-ai/api-contract'
import { oc } from '@orpc/contract'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createMemoryTokenStorage } from '../src/api-client-auth.js'
import { api } from '../src/api-client-main.js'
import { HaiApiClientError } from '../src/api-client-types.js'
import { createApiClient } from '../src/create-api-client.js'

const HealthOutputSchema = haiResultSchema(z.object({ status: z.string() }))

const testContract = {
  health: oc.route({ method: 'GET', path: '/health' }).output(HealthOutputSchema),
}

describe('createApiClient', () => {
  afterEach(async () => {
    await api.close()
  })

  it('初始状态为未初始化', () => {
    const client = createApiClient(testContract)

    expect(client.isInitialized).toBe(false)
    expect(client.config).toBeNull()
  })

  it('未初始化调用返回 NOT_INITIALIZED', async () => {
    const client = createApiClient(testContract)

    const result = await client.health()

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiApiClientError.NOT_INITIALIZED.code)
    }
  })

  it('init 后可按 contract 直接调用 procedure', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { status: 'ok' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const client = createApiClient(testContract)

    const initResult = await client.init({ baseUrl: 'https://api.test.com/api/v1', fetch })
    const result = await client.health()

    expect(initResult.success).toBe(true)
    expect(client.isInitialized).toBe(true)
    expect(result).toEqual({ success: true, data: { status: 'ok' } })
    expect(fetch).toHaveBeenCalledTimes(1)
    const request = fetch.mock.calls[0]?.[0] as Request
    expect(request.url).toBe('https://api.test.com/api/v1/health')
  })

  it('401 后使用 refreshPath 刷新 token 并重试', async () => {
    const storage = createMemoryTokenStorage()
    await storage.setAccessToken('old-access')
    await storage.setRefreshToken('old-refresh')

    const newTokens = {
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      expiresIn: 3600,
      tokenType: 'Bearer' as const,
    }

    const fetch = vi.fn().mockImplementation((request: Request) => {
      if (request.url === 'https://api.test.com/api/v1/auth/refresh') {
        return Promise.resolve(new Response(JSON.stringify({ success: true, data: { tokens: newTokens } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }))
      }

      if (request.headers.get('authorization') === 'Bearer old-access') {
        return Promise.resolve(new Response(JSON.stringify({ message: 'expired' }), { status: 401 }))
      }

      return Promise.resolve(new Response(JSON.stringify({ success: true, data: { status: 'ok' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
    })

    const client = createApiClient(testContract)
    await client.init({
      baseUrl: 'https://api.test.com/api/v1',
      fetch,
      auth: { storage, refreshPath: '/auth/refresh' },
    })

    const result = await client.health()

    expect(result.success).toBe(true)
    expect(await storage.getAccessToken()).toBe('new-access')
    expect(await storage.getRefreshToken()).toBe('new-refresh')
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('默认 api 单例绑定 apiServiceContract', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { status: 'ok' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const initResult = await api.init({ baseUrl: 'https://api.test.com/api/v1', fetch })

    expect(initResult.success).toBe(true)
    expect(api.isInitialized).toBe(true)
    expect(api.config?.baseUrl).toBe('https://api.test.com/api/v1')
  })

  it('请求超时返回 TIMEOUT 错误', async () => {
    const fetch = vi.fn().mockImplementation((request: Request) => {
      return new Promise<Response>((_resolve, reject) => {
        request.signal.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'))
        })
      })
    })

    const client = createApiClient(testContract)
    await client.init({
      baseUrl: 'https://api.test.com/api/v1',
      fetch,
      timeout: 10,
    })

    const result = await client.health()
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiApiClientError.TIMEOUT.code)
    }
  })
})
