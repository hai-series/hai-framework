import { apiContract } from '@h-ai/api-contract'
import { oc } from '@orpc/contract'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { apiClient, HaiApiClientError } from '../src/index.js'

const HealthOutputSchema = apiContract.haiResultSchema(z.object({ status: z.string() }))

const testContract = {
  health: oc.route({ method: 'GET', path: '/health' }).output(HealthOutputSchema),
}

describe('apiClient.create', () => {
  afterEach(async () => {
    await apiClient.close()
  })

  it('初始状态为未初始化', () => {
    const client = apiClient.create(testContract)

    expect(client.isInitialized).toBe(false)
    expect(client.config).toBeNull()
  })

  it('未初始化调用返回 NOT_INITIALIZED', async () => {
    const client = apiClient.create(testContract)

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
    const client = apiClient.create(testContract)

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
    const storage = apiClient.tokenStorage.memory()
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

    const client = apiClient.create(testContract)
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

  it('apiClient 默认单例绑定 iam/storage/ai contract，并保留 create/tokenStorage 入口', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { status: 'ok' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const initResult = await apiClient.init({ baseUrl: 'https://api.test.com/api/v1', fetch })

    expect(initResult.success).toBe(true)
    expect(apiClient.isInitialized).toBe(true)
    expect(apiClient.config?.baseUrl).toBe('https://api.test.com/api/v1')
    expect(typeof apiClient.create).toBe('function')
    expect(typeof apiClient.tokenStorage.memory).toBe('function')
  })

  it('请求超时返回 TIMEOUT 错误', async () => {
    const fetch = vi.fn().mockImplementation((request: Request) => {
      return new Promise<Response>((_resolve, reject) => {
        request.signal.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'))
        })
      })
    })

    const client = apiClient.create(testContract)
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

  it('401 后带 body 的请求能用 clone 重发，body 不被丢失', async () => {
    const echoContract = {
      echo: oc.route({ method: 'POST', path: '/echo' })
        .input(z.object({ msg: z.string() }))
        .output(apiContract.haiResultSchema(z.object({ received: z.string() }))),
    }

    const storage = apiClient.tokenStorage.memory()
    await storage.setAccessToken('old-access')
    await storage.setRefreshToken('old-refresh')

    const newTokens = {
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      expiresIn: 3600,
      tokenType: 'Bearer' as const,
    }

    const seenBodies: string[] = []

    const fetch = vi.fn().mockImplementation(async (request: Request) => {
      if (request.url === 'https://api.test.com/api/v1/auth/refresh') {
        return new Response(JSON.stringify({ success: true, data: { tokens: newTokens } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      const text = await request.text()
      seenBodies.push(text)
      if (request.headers.get('authorization') === 'Bearer old-access') {
        return new Response(JSON.stringify({ message: 'expired' }), { status: 401 })
      }
      return new Response(JSON.stringify({ success: true, data: { received: text } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    const client = apiClient.create(echoContract)
    await client.init({
      baseUrl: 'https://api.test.com/api/v1',
      fetch,
      auth: { storage, refreshPath: '/auth/refresh' },
    })

    const result = await client.echo({ msg: 'hello' })

    expect(result.success).toBe(true)
    // 第一次（401）与重试都应携带完整 body，证明 clone 生效。
    const businessBodies = seenBodies.filter(b => b.length > 0)
    expect(businessBodies.length).toBe(2)
    expect(businessBodies[0]).toContain('hello')
    expect(businessBodies[1]).toContain('hello')
    await client.close()
  })
})
