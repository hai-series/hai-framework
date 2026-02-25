/**
 * =============================================================================
 * @h-ai/kit - Cache Module 测试
 * =============================================================================
 */

import type { RequestEvent } from '@sveltejs/kit'
import type { CacheHandleConfig } from '../src/modules/cache/cache-types.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCacheHandle, createCacheUtils } from '../src/modules/cache/cache-handle.js'

/**
 * 创建模拟的 Cache 服务
 */
function createMockCache() {
  const store = new Map<string, { value: unknown, ttl: number, cachedAt: number }>()

  return {
    get: vi.fn(async (key: string) => {
      const item = store.get(key)
      if (item) {
        return { success: true, data: item.value }
      }
      return { success: true, data: null }
    }),
    set: vi.fn(async (key: string, value: unknown, ttl: number) => {
      store.set(key, { value, ttl, cachedAt: Date.now() })
      return { success: true }
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key)
      return { success: true }
    }),
    deleteByPattern: vi.fn(async (pattern: string) => {
      const prefix = pattern.replace('*', '')
      for (const key of store.keys()) {
        if (key.startsWith(prefix)) {
          store.delete(key)
        }
      }
      return { success: true }
    }),
    _store: store,
  }
}

/**
 * 创建模拟的 RequestEvent
 */
function createMockEvent(
  path = '/',
  options: {
    method?: string
    headers?: Record<string, string>
  } = {},
): RequestEvent {
  const url = new URL(`http://localhost${path}`)

  return {
    request: new Request(url, {
      method: options.method || 'GET',
      headers: options.headers,
    }),
    url,
    locals: {},
    params: {},
    route: { id: path },
    getClientAddress: () => '127.0.0.1',
  } as unknown as RequestEvent
}

describe('createCacheHandle', () => {
  let mockCache: ReturnType<typeof createMockCache>

  beforeEach(() => {
    mockCache = createMockCache()
  })

  it('应该缓存 GET 请求', async () => {
    const handle = createCacheHandle({
      cache: mockCache as unknown as CacheHandleConfig['cache'],
      routes: {
        '/api/products': { ttl: 300 },
      },
    })

    const event = createMockEvent('/api/products')
    const resolve = vi.fn().mockResolvedValue(
      new Response('{"products":[]}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    // 第一次请求 - MISS
    const response1 = await handle({ event, resolve })

    expect(resolve).toHaveBeenCalledTimes(1)
    expect(response1.headers.get('X-Cache')).toBe('MISS')
    expect(mockCache.set).toHaveBeenCalled()
  })

  it('应该返回缓存的响应', async () => {
    // 预设缓存
    mockCache._store.set('kit:cache:/api/products', {
      value: {
        body: '{"products":["cached"]}',
        status: 200,
        headers: { 'content-type': 'application/json' },
        cachedAt: Date.now(),
      },
      ttl: 300,
      cachedAt: Date.now(),
    })
    mockCache.get.mockResolvedValue({
      success: true,
      data: {
        body: '{"products":["cached"]}',
        status: 200,
        headers: { 'content-type': 'application/json' },
        cachedAt: Date.now(),
      },
    })

    const handle = createCacheHandle({
      cache: mockCache as unknown as CacheHandleConfig['cache'],
      routes: {
        '/api/products': { ttl: 300 },
      },
    })

    const event = createMockEvent('/api/products')
    const resolve = vi.fn()

    const response = await handle({ event, resolve })

    expect(resolve).not.toHaveBeenCalled()
    expect(response.headers.get('X-Cache')).toBe('HIT')

    const body = await response.text()
    expect(body).toBe('{"products":["cached"]}')
  })

  it('应该跳过非 GET 请求', async () => {
    const handle = createCacheHandle({
      cache: mockCache as unknown as CacheHandleConfig['cache'],
      routes: {
        '/api/products': { ttl: 300 },
      },
    })

    const event = createMockEvent('/api/products', { method: 'POST' })
    const resolve = vi.fn().mockResolvedValue(new Response('OK'))

    await handle({ event, resolve })

    expect(resolve).toHaveBeenCalled()
    expect(mockCache.get).not.toHaveBeenCalled()
  })

  it('应该支持绕过缓存头', async () => {
    mockCache.get.mockResolvedValue({
      success: true,
      data: { body: 'cached', status: 200, headers: {}, cachedAt: Date.now() },
    })

    const handle = createCacheHandle({
      cache: mockCache as unknown as CacheHandleConfig['cache'],
      routes: {
        '/api/products': { ttl: 300 },
      },
      bypassHeader: 'X-Cache-Bypass',
    })

    const event = createMockEvent('/api/products', {
      headers: { 'X-Cache-Bypass': '1' },
    })
    const resolve = vi.fn().mockResolvedValue(new Response('fresh'))

    await handle({ event, resolve })

    expect(resolve).toHaveBeenCalled()
  })

  it('应该支持通配符路由', async () => {
    const handle = createCacheHandle({
      cache: mockCache as unknown as CacheHandleConfig['cache'],
      routes: {
        '/api/users/*': { ttl: 60 },
      },
    })

    const event = createMockEvent('/api/users/123')
    const resolve = vi.fn().mockResolvedValue(
      new Response('{"user":{}}', { status: 200 }),
    )

    const response = await handle({ event, resolve })

    expect(mockCache.set).toHaveBeenCalled()
    expect(response.headers.get('X-Cache')).toBe('MISS')
  })

  it('应该只缓存成功的响应', async () => {
    const handle = createCacheHandle({
      cache: mockCache as unknown as CacheHandleConfig['cache'],
      routes: {
        '/api/error': { ttl: 300 },
      },
    })

    const event = createMockEvent('/api/error')
    const resolve = vi.fn().mockResolvedValue(
      new Response('Not Found', { status: 404 }),
    )

    await handle({ event, resolve })

    expect(mockCache.set).not.toHaveBeenCalled()
  })

  it('应该跳过没有配置 TTL 的路由', async () => {
    const handle = createCacheHandle({
      cache: mockCache as unknown as CacheHandleConfig['cache'],
      routes: {},
    })

    const event = createMockEvent('/api/no-cache')
    const resolve = vi.fn().mockResolvedValue(new Response('OK'))

    await handle({ event, resolve })

    expect(resolve).toHaveBeenCalled()
    expect(mockCache.get).not.toHaveBeenCalled()
  })

  it('应该使用自定义 keyGenerator', async () => {
    const handle = createCacheHandle({
      cache: mockCache as unknown as CacheHandleConfig['cache'],
      routes: {
        '/api/user': {
          ttl: 60,
          keyGenerator: event => `user:${event.url.searchParams.get('id')}`,
        },
      },
    })

    const event = createMockEvent('/api/user?id=123')
    const resolve = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))

    await handle({ event, resolve })

    expect(mockCache.set).toHaveBeenCalledWith(
      'user:123',
      expect.any(Object),
      expect.any(Number),
    )
  })
})

describe('createCacheUtils', () => {
  let mockCache: ReturnType<typeof createMockCache>
  let utils: ReturnType<typeof createCacheUtils>

  beforeEach(() => {
    mockCache = createMockCache()
    utils = createCacheUtils(mockCache as unknown as CacheHandleConfig['cache'])
  })

  it('应该清除指定路径的缓存', async () => {
    await utils.invalidatePath('/api/products')

    expect(mockCache.delete).toHaveBeenCalledWith('kit:cache:/api/products')
  })

  it('应该清除带查询参数的缓存', async () => {
    await utils.invalidatePath('/api/products', '?category=electronics')

    expect(mockCache.delete).toHaveBeenCalledWith('kit:cache:/api/products?category=electronics')
  })

  it('应该清除指定前缀的缓存', async () => {
    await utils.invalidatePrefix('/api/products')

    expect(mockCache.deleteByPattern).toHaveBeenCalledWith('kit:cache:/api/products*')
  })

  it('应该预热缓存', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      body: '{"warmed":true}',
      status: 200,
      headers: { 'content-type': 'application/json' },
    })

    await utils.warmup('/api/data', fetcher, 300)

    expect(fetcher).toHaveBeenCalled()
    expect(mockCache.set).toHaveBeenCalledWith(
      'kit:cache:/api/data',
      expect.objectContaining({
        body: '{"warmed":true}',
        status: 200,
      }),
      300,
    )
  })
})
