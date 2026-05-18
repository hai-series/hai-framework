/**
 * @h-ai/api-client — Token 管理测试
 */

import { describe, expect, it, vi } from 'vitest'
import { createHttpOnlyCookieTokenStorage, createMemoryTokenStorage, createTokenManager } from '../src/api-client-auth.js'

describe('createMemoryTokenStorage', () => {
  it('存取 Token', async () => {
    const storage = createMemoryTokenStorage()

    await storage.setAccessToken('access-123')
    await storage.setRefreshToken('refresh-456')

    expect(await storage.getAccessToken()).toBe('access-123')
    expect(await storage.getRefreshToken()).toBe('refresh-456')
  })

  it('clear 清空所有 Token', async () => {
    const storage = createMemoryTokenStorage()
    await storage.setAccessToken('a')
    await storage.setRefreshToken('r')

    await storage.clear()

    expect(await storage.getAccessToken()).toBeNull()
    expect(await storage.getRefreshToken()).toBeNull()
  })
})

describe('createTokenManager', () => {
  it('refresh 成功后更新存储并通知回调', async () => {
    const storage = createMemoryTokenStorage()
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
    const storage = createMemoryTokenStorage()
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
    const storage = createMemoryTokenStorage()
    const onFailed = vi.fn()
    const manager = createTokenManager(storage, 'https://api.test.com/auth/refresh', vi.fn(), onFailed)

    const result = await manager.refresh()

    expect(result).toBeNull()
    expect(onFailed).toHaveBeenCalled()
  })

  it('refresh 接口 401 时清空存储并触发失败回调', async () => {
    const storage = createMemoryTokenStorage()
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
    const storage = createMemoryTokenStorage()
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
    const storage = createMemoryTokenStorage()
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
    const storage = createMemoryTokenStorage()
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
    const storage = createMemoryTokenStorage()
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
    const storage = createMemoryTokenStorage()
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
    const storage = createMemoryTokenStorage()
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

describe('createHttpOnlyCookieTokenStorage', () => {
  it('access token 可读写（内存存储）', async () => {
    const storage = createHttpOnlyCookieTokenStorage()
    expect(await storage.getAccessToken()).toBeNull()

    await storage.setAccessToken('access-abc')
    expect(await storage.getAccessToken()).toBe('access-abc')
  })

  it('getRefreshToken 返回哨兵值而非 null（确保 doRefresh 不会短路跳过）', async () => {
    const storage = createHttpOnlyCookieTokenStorage()
    const rt = await storage.getRefreshToken()
    // 非 null/空，确保 TokenManager 能进入 doRefresh 逻辑
    expect(rt).toBeTruthy()
  })

  it('setRefreshToken 是 no-op（由服务端 Set-Cookie 管理）', async () => {
    const storage = createHttpOnlyCookieTokenStorage()
    // 不抛异常即可；JS 端无法写入 httpOnly cookie
    await expect(storage.setRefreshToken('ignored')).resolves.toBeUndefined()
    // 读取仍返回哨兵，不受 setRefreshToken 影响
    expect(await storage.getRefreshToken()).toBeTruthy()
  })

  it('clear 清空内存 access token，不影响 httpOnly cookie', async () => {
    const storage = createHttpOnlyCookieTokenStorage()
    await storage.setAccessToken('access-abc')
    await storage.clear()
    // access token 已清空（内存）
    expect(await storage.getAccessToken()).toBeNull()
    // getRefreshToken 仍返回哨兵（httpOnly cookie 由服务端管理，clear 不清除）
    expect(await storage.getRefreshToken()).toBeTruthy()
  })

  it('与 TokenManager 协作：refresh 请求不在 body 中携带 refreshToken', async () => {
    const storage = createHttpOnlyCookieTokenStorage()
    const newTokens = {
      accessToken: 'new-access',
      refreshToken: 'server-managed',
      expiresIn: 3600,
      tokenType: 'Bearer' as const,
    }
    let capturedRequest: Request | undefined
    const mockFetch = vi.fn().mockImplementation(async (req: Request) => {
      capturedRequest = req
      return new Response(JSON.stringify({ data: newTokens }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    const manager = createTokenManager(storage, 'https://api.test.com/auth/refresh', mockFetch)
    const result = await manager.refresh()

    // refresh 成功，access token 写入内存存储
    expect(result?.accessToken).toBe('new-access')
    expect(await storage.getAccessToken()).toBe('new-access')

    // 请求体为空（不携带 refreshToken，依赖浏览器自动发送 httpOnly cookie）
    expect(capturedRequest?.body).toBeNull()
    // 跨域时需 credentials: 'include' 以确保浏览器发送 Cookie
    expect(capturedRequest?.credentials).toBe('include')
  })
})
