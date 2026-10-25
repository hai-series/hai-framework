import { apiContract } from '@h-ai/api-contract'
import { core } from '@h-ai/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { apiClient, HaiApiClientError } from '../src/index.js'

const testContract = {
  health: apiContract
    .route({ method: 'GET', path: '/health' })
    .output(apiContract.haiResultSchema(z.object({ status: z.string() }))),
}

function toRequest(input: RequestInfo | URL, init?: RequestInit): Request {
  return input instanceof Request ? input : new Request(input, init)
}

describe('apiClient.create', () => {
  afterEach(async () => {
    await apiClient.close()
    core.i18n.setGlobalLocale('zh-CN')
  })

  it('请求跟随当前语言，并保留调用方显式指定的语言头', async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({
      success: true,
      data: { status: 'ok' },
    }), { headers: { 'content-type': 'application/json' } })))
    const client = apiClient.create(testContract)
    try {
      expect((await client.init({ baseUrl: 'https://api.test.com/api/v1', fetch })).success).toBe(true)
      core.i18n.setGlobalLocale('ja')
      expect((await client.health()).success).toBe(true)
      expect(toRequest(fetch.mock.calls.at(-1)![0]).headers.get('accept-language')).toBe('ja-JP')
      core.i18n.setGlobalLocale('en-US')
      expect((await client.health()).success).toBe(true)
      expect(toRequest(fetch.mock.calls.at(-1)![0]).headers.get('accept-language')).toBe('en-US')
      await client.close()
      expect((await client.init({ baseUrl: 'https://api.test.com/api/v1', fetch, headers: { 'Accept-Language': 'ja-JP' } })).success).toBe(true)
      expect((await client.health()).success).toBe(true)
      expect(toRequest(fetch.mock.calls.at(-1)![0]).headers.get('accept-language')).toBe('ja-JP')
    }
    finally {
      await client.close()
    }
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

  it('重复 init 返回 CONFIG_ERROR 并保留原始 client 状态', async () => {
    const firstFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { status: 'ok' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const secondFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { status: 'other' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const client = apiClient.create(testContract)

    const firstInit = await client.init({ baseUrl: 'https://api.test.com/api/v1', fetch: firstFetch })
    const secondInit = await client.init({ baseUrl: 'https://other.test/api/v1', fetch: secondFetch })
    const result = await client.health()

    expect(firstInit.success).toBe(true)
    expect(secondInit.success).toBe(false)
    if (!secondInit.success) {
      expect(secondInit.error.code).toBe(HaiApiClientError.CONFIG_ERROR.code)
    }
    // 重复 init 不应覆盖已可用实例；重新配置必须显式 close()，否则旧 transport 难以释放。
    expect(client.config?.baseUrl).toBe('https://api.test.com/api/v1')
    expect(result).toEqual({ success: true, data: { status: 'ok' } })
    expect(firstFetch).toHaveBeenCalledTimes(1)
    expect(secondFetch).not.toHaveBeenCalled()
  })

  it('401 后使用 refreshPath 刷新 token 并重试', async () => {
    core.i18n.setGlobalLocale('ja-JP')
    const storage = apiClient.tokenStorage.memory()
    await storage.setAccessToken('old-access')
    await storage.setRefreshToken('old-refresh')

    const newTokens = {
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      expiresIn: 3600,
      tokenType: 'Bearer' as const,
    }

    const fetch = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const request = toRequest(input, init)
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
      clientName: 'native-app',
      headers: async () => ({ 'x-hai-token-transport': 'body' }),
    })

    const result = await client.health()

    expect(result.success).toBe(true)
    expect(await storage.getAccessToken()).toBe('new-access')
    expect(await storage.getRefreshToken()).toBe('new-refresh')
    expect(fetch).toHaveBeenCalledTimes(3)
    const refreshCall = fetch.mock.calls.find(([input]) => toRequest(input).url.endsWith('/auth/refresh'))
    expect(refreshCall).toBeDefined()
    const refreshRequest = toRequest(refreshCall![0], refreshCall![1])
    expect(refreshRequest.headers.get('x-hai-token-transport')).toBe('body')
    expect(refreshRequest.headers.get('x-request-client')).toBe('native-app')
    expect(refreshRequest.headers.get('content-type')).toBe('application/json')
    expect(refreshRequest.headers.get('accept-language')).toBe('ja-JP')
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

  it('hTTP 200 HaiResult 的 401 能恢复 Cookie 会话并只重试一次', async () => {
    let refreshed = false
    let calls = 0
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = toRequest(input, init)
      if (request.url.endsWith('/auth/refresh')) {
        expect(request.credentials).toBe('include')
        expect(request.body).toBeNull()
        refreshed = true
        return Response.json({ success: true, data: { tokens: { accessToken: 'restored', expiresIn: 3600, tokenType: 'Bearer' } } })
      }
      calls++
      if (!refreshed)
        return Response.json({ success: false, error: { code: 'hai:serv:401', message: 'Unauthorized', httpStatus: 401 } })
      expect(request.headers.get('authorization')).toBe('Bearer restored')
      // 第二次仍未授权时必须原样返回，不能进入无限刷新。
      return Response.json({ success: false, error: { code: 'hai:serv:401', message: 'Still unauthorized', httpStatus: 401 } })
    })
    const client = apiClient.create(testContract)
    expect((await client.init({ baseUrl: 'https://api.test.com/api/v1', fetch, auth: {} })).success).toBe(true)
    const result = await client.health()
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.message).toMatch(/^Still unauthorized \(traceId: [\w.:-]+\)$/)
    expect(calls).toBe(2)
    expect(fetch).toHaveBeenCalledTimes(3)
    await client.close()
  })

  it.each([403, 500])('hTTP 200 HaiResult 的 %i 不触发认证刷新', async (status) => {
    const failure = { success: false, error: { code: 'app:failure', message: 'Failure', httpStatus: status } }
    const fetch = vi.fn(async () => Response.json(failure))
    const client = apiClient.create(testContract)
    expect((await client.init({ baseUrl: 'https://api.test.com/api/v1', fetch, auth: {} })).success).toBe(true)
    const result = await client.health()
    expect(result).toMatchObject({ success: false, error: { code: failure.error.code, httpStatus: status, traceId: expect.any(String) } })
    if (!result.success) {
      expect(result.error.message).toMatch(/\(traceId: [\w.:-]+\)$/)
      if (status === 500)
        expect(result.error.message).not.toContain('Failure')
    }
    expect(fetch).toHaveBeenCalledTimes(1)
    await client.close()
  })

  it('登录失败不自动刷新已有 Cookie 或重试错误凭据', async () => {
    const contract = apiContract.create({ iam: apiContract.iam })
    const fetch = vi.fn(async () => Response.json({ success: false, error: { code: 'hai:iam:401', message: 'Invalid credentials', httpStatus: 401 } }))
    const client = apiClient.create(contract)
    expect((await client.init({ baseUrl: 'https://api.test.com/api/v1', fetch, auth: {} })).success).toBe(true)
    const result = await client.iam.auth.login({ identifier: 'alice', password: 'wrong-password' })
    expect(result.success).toBe(false)
    expect(fetch).toHaveBeenCalledTimes(1)
    await client.close()
  })

  it('config getter 应返回脱敏后的 baseUrl 与 headers 快照', async () => {
    const client = apiClient.create(testContract)
    const initResult = await client.init({
      baseUrl: 'https://user:pass@api.test.com/api/v1',
      headers: {
        authorization: 'Bearer secret-token',
      },
    })

    expect(initResult.success).toBe(true)
    expect(client.config?.baseUrl).toBe('https://[REDACTED]:[REDACTED]@api.test.com/api/v1')
    if (client.config?.headers && typeof client.config.headers !== 'function') {
      expect(client.config.headers.authorization).toBe('[REDACTED]')
    }

    await client.close()
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
      echo: apiContract.route({ method: 'POST', path: '/echo' })
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

    const fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = toRequest(input, init)
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
