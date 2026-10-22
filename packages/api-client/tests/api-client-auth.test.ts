/**
 * @h-ai/api-client — Token 管理测试
 */

import { describe, expect, it, vi } from 'vitest'
import { createTokenManager } from '../src/api-client-auth.js'
import { apiClient } from '../src/index.js'

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}

function tokenPair(name: string) {
  return { accessToken: `${name}-access`, refreshToken: `${name}-refresh`, expiresIn: 3600, tokenType: 'Bearer' as const }
}

describe('apiClient.tokenStorage.memory', () => {
  it('存取 Token', async () => {
    const storage = apiClient.tokenStorage.memory()

    await storage.setAccessToken('access-123')
    await storage.setRefreshToken('refresh-456')

    expect(await storage.getAccessToken()).toBe('access-123')
    expect(await storage.getRefreshToken()).toBe('refresh-456')
  })

  it('clear 清空所有 Token', async () => {
    const storage = apiClient.tokenStorage.memory()
    await storage.setAccessToken('a')
    await storage.setRefreshToken('r')

    await storage.clear()

    expect(await storage.getAccessToken()).toBeNull()
    expect(await storage.getRefreshToken()).toBeNull()
  })
})

describe('createTokenManager', () => {
  it('替换账号时未提供 refreshToken 不保留旧账号的刷新凭据', async () => {
    const storage = apiClient.tokenStorage.memory()
    await storage.setRefreshToken('old-account-refresh')
    const manager = createTokenManager(storage, 'https://api.test.com/auth/refresh', vi.fn())

    await manager.setTokens({ accessToken: 'new-account-access', expiresIn: 3600, tokenType: 'Bearer' })

    expect(await storage.getAccessToken()).toBe('new-account-access')
    expect(await storage.getRefreshToken()).toBeNull()
  })

  it('退出后丢弃在途刷新结果并取消请求', async () => {
    const storage = apiClient.tokenStorage.memory()
    await storage.setRefreshToken('old-refresh')
    const response = deferred<Response>()
    const mockFetch = vi.fn<typeof fetch>().mockReturnValue(response.promise)
    const onRefreshed = vi.fn()
    const onFailed = vi.fn()
    const manager = createTokenManager(storage, 'https://api.test.com/auth/refresh', mockFetch, onFailed)
    manager.onTokenRefreshed(onRefreshed)

    const pending = manager.refresh()
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledOnce())
    await manager.clear()
    expect(mockFetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
    // 自定义 fetch 即使忽略取消，迟到响应也不能恢复会话。
    response.resolve(Response.json({ data: tokenPair('old') }))

    expect(await pending).toBeNull()
    expect(await storage.getAccessToken()).toBeNull()
    expect(await storage.getRefreshToken()).toBeNull()
    expect(onRefreshed).not.toHaveBeenCalled()
    expect(onFailed).not.toHaveBeenCalled()
  })

  it.each([200, 401])('切换账号后忽略旧刷新响应（HTTP %s）', async (status) => {
    const storage = apiClient.tokenStorage.memory()
    await storage.setRefreshToken('old-refresh')
    const response = deferred<Response>()
    const mockFetch = vi.fn<typeof fetch>().mockReturnValue(response.promise)
    const onRefreshed = vi.fn()
    const onFailed = vi.fn()
    const manager = createTokenManager(storage, 'https://api.test.com/auth/refresh', mockFetch, onFailed)
    manager.onTokenRefreshed(onRefreshed)

    const pending = manager.refresh()
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledOnce())
    await manager.setTokens(tokenPair('new-account'))
    response.resolve(status === 200 ? Response.json({ data: tokenPair('old') }) : new Response(null, { status }))

    expect(await pending).toBeNull()
    expect(await storage.getAccessToken()).toBe('new-account-access')
    expect(await storage.getRefreshToken()).toBe('new-account-refresh')
    expect(onRefreshed).not.toHaveBeenCalled()
    expect(onFailed).not.toHaveBeenCalled()
  })

  it.each(['clear', 'setTokens'] as const)('刷新已经开始异步写入时，后续 %s 仍是最终状态', async (operation) => {
    const memory = apiClient.tokenStorage.memory()
    await memory.setRefreshToken('old-refresh')
    const writeStarted = deferred<void>()
    const releaseWrite = deferred<void>()
    const storage = {
      ...memory,
      async setAccessToken(token: string) {
        if (token === 'old-access') {
          writeStarted.resolve()
          await releaseWrite.promise
        }
        await memory.setAccessToken(token)
      },
    }
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ data: tokenPair('old') }))
    const onRefreshed = vi.fn()
    const manager = createTokenManager(storage, 'https://api.test.com/auth/refresh', mockFetch)
    manager.onTokenRefreshed(onRefreshed)

    const pending = manager.refresh()
    await writeStarted.promise
    const mutation = operation === 'clear' ? manager.clear() : manager.setTokens(tokenPair('new-account'))
    releaseWrite.resolve()
    await mutation

    expect(await pending).toBeNull()
    expect(await memory.getAccessToken()).toBe(operation === 'clear' ? null : 'new-account-access')
    expect(await memory.getRefreshToken()).toBe(operation === 'clear' ? null : 'new-account-refresh')
    expect(onRefreshed).not.toHaveBeenCalled()
  })

  it('旧刷新结束时不会清除新账号刷新请求的去重状态', async () => {
    const storage = apiClient.tokenStorage.memory()
    await storage.setRefreshToken('old-refresh')
    const oldResponse = deferred<Response>()
    const newResponse = deferred<Response>()
    const mockFetch = vi.fn<typeof fetch>()
      .mockReturnValueOnce(oldResponse.promise)
      .mockReturnValueOnce(newResponse.promise)
    const manager = createTokenManager(storage, 'https://api.test.com/auth/refresh', mockFetch)

    const oldRefresh = manager.refresh()
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))
    await manager.setTokens(tokenPair('new-account'))
    const newRefresh = manager.refresh()
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2))
    oldResponse.resolve(Response.json({ data: tokenPair('old') }))
    expect(await oldRefresh).toBeNull()
    const duplicateRefresh = manager.refresh()
    newResponse.resolve(Response.json({ data: tokenPair('new-refreshed') }))

    expect(await newRefresh).toEqual(tokenPair('new-refreshed'))
    expect(await duplicateRefresh).toEqual(tokenPair('new-refreshed'))
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('refresh 成功后更新存储并通知回调', async () => {
    const storage = apiClient.tokenStorage.memory()
    await storage.setRefreshToken('old-refresh')

    const newTokens = {
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      expiresIn: 3600,
      tokenType: 'Bearer' as const,
    }

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: newTokens }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const callback = vi.fn()
    const manager = createTokenManager(storage, 'https://api.test.com/auth/refresh', mockFetch)
    manager.onTokenRefreshed(callback)

    const result = await manager.refresh()

    expect(result).toEqual(newTokens)
    expect(await storage.getAccessToken()).toBe('new-access')
    expect(await storage.getRefreshToken()).toBe('new-refresh')
    expect(callback).toHaveBeenCalledWith(newTokens)
  })

  it('refresh 支持 HaiResult tokens 包装格式', async () => {
    const storage = apiClient.tokenStorage.memory()
    await storage.setRefreshToken('old-refresh')

    const newTokens = {
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      expiresIn: 3600,
      tokenType: 'Bearer' as const,
    }

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { tokens: newTokens } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const manager = createTokenManager(storage, 'https://api.test.com/auth/refresh', mockFetch)
    const result = await manager.refresh()

    expect(result).toEqual(newTokens)
    expect(await storage.getAccessToken()).toBe('new-access')
    expect(await storage.getRefreshToken()).toBe('new-refresh')
  })

  it('无 refreshToken 时刷新失败', async () => {
    const storage = apiClient.tokenStorage.memory()
    const onFailed = vi.fn()
    const manager = createTokenManager(storage, 'https://api.test.com/auth/refresh', vi.fn(), onFailed)

    const result = await manager.refresh()

    expect(result).toBeNull()
    expect(onFailed).toHaveBeenCalled()
  })

  it('refresh 接口 401 时清空存储并触发失败回调', async () => {
    const storage = apiClient.tokenStorage.memory()
    await storage.setRefreshToken('expired-token')

    const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 401 }))
    const onFailed = vi.fn()
    const manager = createTokenManager(storage, 'https://api.test.com/auth/refresh', mockFetch, onFailed)

    const result = await manager.refresh()

    expect(result).toBeNull()
    expect(onFailed).toHaveBeenCalled()
    expect(await storage.getRefreshToken()).toBeNull()
  })

  it('并发 refresh 去重', async () => {
    const storage = apiClient.tokenStorage.memory()
    await storage.setRefreshToken('rt')

    const newTokens = {
      accessToken: 'a',
      refreshToken: 'r',
      expiresIn: 3600,
      tokenType: 'Bearer' as const,
    }

    let callCount = 0
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++
      return Promise.resolve(
        new Response(JSON.stringify({ data: newTokens }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
    })

    const manager = createTokenManager(storage, 'https://api.test.com/auth/refresh', mockFetch)

    // 并发 3 次 refresh
    const [r1, r2, r3] = await Promise.all([
      manager.refresh(),
      manager.refresh(),
      manager.refresh(),
    ])

    // fetch 应只调用一次
    expect(callCount).toBe(1)
    expect(r1).toEqual(newTokens)
    expect(r2).toEqual(newTokens)
    expect(r3).toEqual(newTokens)
  })

  it('onTokenRefreshed 返回取消订阅函数', async () => {
    const storage = apiClient.tokenStorage.memory()
    await storage.setRefreshToken('rt')

    const newTokens = {
      accessToken: 'a',
      refreshToken: 'r',
      expiresIn: 3600,
      tokenType: 'Bearer' as const,
    }

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: newTokens }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const callback = vi.fn()
    const manager = createTokenManager(storage, 'https://api.test.com/auth/refresh', mockFetch)
    const unsubscribe = manager.onTokenRefreshed(callback)

    await manager.refresh()
    expect(callback).toHaveBeenCalledTimes(1)

    // 取消订阅后不再收到通知
    unsubscribe()
    await storage.setRefreshToken('rt2')
    await manager.refresh()
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('refresh 响应缺少必要字段时返回 null', async () => {
    const storage = apiClient.tokenStorage.memory()
    await storage.setRefreshToken('rt')

    // 响应缺少 refreshToken
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { accessToken: 'a' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const onFailed = vi.fn()
    const manager = createTokenManager(storage, 'https://api.test.com/auth/refresh', mockFetch, onFailed)

    const result = await manager.refresh()

    expect(result).toBeNull()
    expect(onFailed).toHaveBeenCalled()
    expect(await storage.getRefreshToken()).toBeNull()
  })

  it('refresh 响应 accessToken 为空字符串时返回 null', async () => {
    const storage = apiClient.tokenStorage.memory()
    await storage.setRefreshToken('rt')

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { accessToken: '', refreshToken: 'r' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const onFailed = vi.fn()
    const manager = createTokenManager(storage, 'https://api.test.com/auth/refresh', mockFetch, onFailed)

    const result = await manager.refresh()

    expect(result).toBeNull()
    expect(onFailed).toHaveBeenCalled()
  })

  it('refresh 接口 5xx 时保留 Token 等待重试', async () => {
    const storage = apiClient.tokenStorage.memory()
    await storage.setRefreshToken('keep-me')

    const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 503 }))
    const onFailed = vi.fn()
    const manager = createTokenManager(storage, 'https://api.test.com/auth/refresh', mockFetch, onFailed)

    const result = await manager.refresh()

    expect(result).toBeNull()
    expect(onFailed).not.toHaveBeenCalled()
    // 5xx 视为服务端临时故障，必须保留 Token 让下一次请求重试
    expect(await storage.getRefreshToken()).toBe('keep-me')
  })

  it('refresh 网络异常时保留 Token 不清空', async () => {
    const storage = apiClient.tokenStorage.memory()
    await storage.setRefreshToken('keep-me-too')

    const mockFetch = vi.fn().mockRejectedValue(new Error('network down'))
    const onFailed = vi.fn()
    const manager = createTokenManager(storage, 'https://api.test.com/auth/refresh', mockFetch, onFailed)

    const result = await manager.refresh()

    expect(result).toBeNull()
    expect(onFailed).not.toHaveBeenCalled()
    expect(await storage.getRefreshToken()).toBe('keep-me-too')
  })
})

describe('apiClient.tokenStorage.httpOnlyCookie', () => {
  it('access token 可读写（内存存储）', async () => {
    const storage = apiClient.tokenStorage.httpOnlyCookie()
    expect(await storage.getAccessToken()).toBeNull()

    await storage.setAccessToken('access-abc')
    expect(await storage.getAccessToken()).toBe('access-abc')
  })

  it('getRefreshToken 返回哨兵值而非 null（确保 doRefresh 不会短路跳过）', async () => {
    const storage = apiClient.tokenStorage.httpOnlyCookie()
    const rt = await storage.getRefreshToken()
    // 非 null/空，确保 TokenManager 能进入 doRefresh 逻辑
    expect(rt).toBeTruthy()
  })

  it('setRefreshToken 是 no-op（由服务端 Set-Cookie 管理）', async () => {
    const storage = apiClient.tokenStorage.httpOnlyCookie()
    // 不抛异常即可；JS 端无法写入 httpOnly cookie
    await expect(storage.setRefreshToken('ignored')).resolves.toBeUndefined()
    // 读取仍返回哨兵，不受 setRefreshToken 影响
    expect(await storage.getRefreshToken()).toBeTruthy()
  })

  it('clear 清空内存 access token，不影响 httpOnly cookie', async () => {
    const storage = apiClient.tokenStorage.httpOnlyCookie()
    await storage.setAccessToken('access-abc')
    await storage.clear()
    // access token 已清空（内存）
    expect(await storage.getAccessToken()).toBeNull()
    // getRefreshToken 仍返回哨兵（httpOnly cookie 由服务端管理，clear 不清除）
    expect(await storage.getRefreshToken()).toBeTruthy()
  })

  it('与 TokenManager 协作：refresh 请求不在 body 中携带 refreshToken，且接受服务端擦除后的响应', async () => {
    const storage = apiClient.tokenStorage.httpOnlyCookie()
    const newTokens = {
      accessToken: 'new-access',
      expiresIn: 3600,
      tokenType: 'Bearer' as const,
    }
    let capturedRequest: Request | undefined
    const mockFetch = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedRequest = new Request(input, init)
      return new Response(JSON.stringify({ data: newTokens }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    const manager = createTokenManager(storage, 'https://api.test.com/auth/refresh', mockFetch)
    const result = await manager.refresh()

    // refresh 成功，access token 写入内存存储
    expect(result?.accessToken).toBe('new-access')
    expect(result?.refreshToken).toBeTruthy()
    expect(await storage.getAccessToken()).toBe('new-access')

    // 请求体为空（不携带 refreshToken，依赖浏览器自动发送 httpOnly cookie）
    expect(capturedRequest?.body).toBeNull()
    expect(capturedRequest?.headers.has('Content-Type')).toBe(false)
    // 跨域时需 credentials: 'include' 以确保浏览器发送 Cookie
    expect(capturedRequest?.credentials).toBe('include')
  })
})
