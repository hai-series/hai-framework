/**
 * =============================================================================
 * @hai/kit - Cache Middleware
 * =============================================================================
 * 集成 @hai/cache 的 SvelteKit 中间件
 *
 * 功能：
 * - 请求级缓存
 * - 响应缓存
 * - 缓存头管理
 *
 * @example
 * ```ts
 * // src/hooks.server.ts
 * import { createCacheHandle } from '@hai/kit/modules/cache'
 * import { cache } from '$lib/server/cache'
 *
 * const cacheHandle = createCacheHandle({
 *     cache,
 *     routes: {
 *         '/api/products': { ttl: 300, staleWhileRevalidate: 60 },
 *         '/api/users/*': { ttl: 60 },
 *     }
 * })
 *
 * export const handle = sequence(cacheHandle, yourOtherHandle)
 * ```
 * =============================================================================
 */

import type { Handle, RequestEvent } from '@sveltejs/kit'
import type { CacheHandleConfig, CacheRouteConfig } from './cache-types.js'

/**
 * 生成缓存键
 */
function generateCacheKey(event: RequestEvent, keyGenerator?: CacheRouteConfig['keyGenerator']): string {
  if (keyGenerator) {
    return keyGenerator(event)
  }

  const url = event.url
  const key = `kit:cache:${url.pathname}${url.search}`
  return key
}

/**
 * 匹配路由配置
 */
function matchRoute(
  pathname: string,
  routes: Record<string, CacheRouteConfig>,
): CacheRouteConfig | null {
  // 精确匹配
  if (routes[pathname]) {
    return routes[pathname]
  }

  // 通配符匹配
  for (const [pattern, config] of Object.entries(routes)) {
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -2)
      if (pathname.startsWith(prefix)) {
        return config
      }
    }
  }

  return null
}

/**
 * 创建缓存 Handle
 */
export function createCacheHandle(config: CacheHandleConfig): Handle {
  const {
    cache,
    routes = {},
    defaultTtl = 0,
    methods = ['GET'],
    bypassHeader = 'X-Cache-Bypass',
  } = config

  return async ({ event, resolve }) => {
    const pathname = event.url.pathname
    const method = event.request.method

    // 只缓存指定的 HTTP 方法
    if (!methods.includes(method)) {
      return resolve(event)
    }

    // 检查是否需要绕过缓存
    if (event.request.headers.get(bypassHeader)) {
      return resolve(event)
    }

    // 查找路由配置
    const routeConfig = matchRoute(pathname, routes)
    const ttl = routeConfig?.ttl ?? defaultTtl

    // 如果 TTL 为 0，不缓存
    if (ttl === 0) {
      return resolve(event)
    }

    // 生成缓存键
    const cacheKey = generateCacheKey(event, routeConfig?.keyGenerator)

    // 尝试从缓存获取
    const cachedResult = await cache.get(cacheKey)

    if (cachedResult.success && cachedResult.data) {
      const cached = cachedResult.data as {
        body: string
        status: number
        headers: Record<string, string>
        cachedAt: number
      }

      const age = Math.floor((Date.now() - cached.cachedAt) / 1000)
      const staleWhileRevalidate = routeConfig?.staleWhileRevalidate ?? 0

      // 检查是否需要 stale-while-revalidate
      if (age < ttl + staleWhileRevalidate) {
        const headers = new Headers(cached.headers)
        headers.set('X-Cache', age < ttl ? 'HIT' : 'STALE')
        headers.set('Age', age.toString())
        headers.set('Cache-Control', `max-age=${Math.max(0, ttl - age)}`)

        // 如果是 stale，在后台刷新缓存（fire and forget）
        if (age >= ttl && staleWhileRevalidate > 0) {
          // 异步刷新缓存
          ;(async () => {
            try {
              const response = await resolve(event)
              if (response.ok) {
                const body = await response.text()
                const responseHeaders: Record<string, string> = {}
                response.headers.forEach((value: string, key: string) => {
                  responseHeaders[key] = value
                })
                await cache.set(cacheKey, {
                  body,
                  status: response.status,
                  headers: responseHeaders,
                  cachedAt: Date.now(),
                }, ttl + staleWhileRevalidate)
              }
            }
            catch {
              // 忽略后台刷新错误
            }
          })()
        }

        return new Response(cached.body, {
          status: cached.status,
          headers,
        })
      }
    }

    // 执行请求
    const response = await resolve(event)

    // 只缓存成功的响应
    if (response.ok) {
      const body = await response.text()
      const headers: Record<string, string> = {}
      response.headers.forEach((value: string, key: string) => {
        headers[key] = value
      })

      // 存入缓存
      await cache.set(cacheKey, {
        body,
        status: response.status,
        headers,
        cachedAt: Date.now(),
      }, ttl + (routeConfig?.staleWhileRevalidate ?? 0))

      // 返回新响应
      const newHeaders = new Headers(headers)
      newHeaders.set('X-Cache', 'MISS')
      newHeaders.set('Cache-Control', `max-age=${ttl}`)

      return new Response(body, {
        status: response.status,
        headers: newHeaders,
      })
    }

    return response
  }
}

/**
 * 缓存工具函数
 */
export function createCacheUtils(cache: CacheHandleConfig['cache']) {
  return {
    /**
     * 清除指定前缀的缓存
     */
    async invalidatePrefix(prefix: string): Promise<void> {
      // 这个功能依赖于 cache 实现是否支持
      // 大多数 Redis 实现支持 SCAN + DEL
      const pattern = `kit:cache:${prefix}*`
      await cache.deleteByPattern?.(pattern)
    },

    /**
     * 清除指定路径的缓存
     */
    async invalidatePath(pathname: string, search?: string): Promise<void> {
      const key = `kit:cache:${pathname}${search || ''}`
      await cache.delete(key)
    },

    /**
     * 预热缓存
     */
    async warmup(
      pathname: string,
      fetcher: () => Promise<{ body: string, status: number, headers: Record<string, string> }>,
      ttl: number,
    ): Promise<void> {
      const key = `kit:cache:${pathname}`
      const data = await fetcher()
      await cache.set(key, {
        ...data,
        cachedAt: Date.now(),
      }, ttl)
    },
  }
}
