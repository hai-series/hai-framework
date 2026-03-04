/**
 * @h-ai/api-client — Token 管理测试
 */

import { describe, expect, it, vi } from 'vitest'
import { createMemoryTokenStorage, createTokenManager } from '../src/api-client-auth.js'

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
})
