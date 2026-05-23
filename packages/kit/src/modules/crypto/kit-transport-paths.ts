/**
 * @h-ai/kit — 传输加密路径匹配工具
 *
 * 统一定义哪些同源请求应纳入 transport 保护范围，供服务端 middleware
 * 与浏览器端 fetch 包装共同复用，避免两端判断漂移。
 * @module kit-transport-paths
 */

import { TRANSPORT_PROTOCOL } from '@h-ai/crypto'

export const DEFAULT_TRANSPORT_KEY_EXCHANGE_PATH = `/api${TRANSPORT_PROTOCOL.DEFAULT_KEY_EXCHANGE_PATH}`

const API_PREFIX = '/api/'
const ROOT_DATA_PATH = '/__data.json'
const DATA_SUFFIX = '/__data.json'

function normalizePath(pathname: string): string {
  return pathname.startsWith('/') ? pathname : `/${pathname}`
}

/** 判断路径是否为 SvelteKit 的页面数据端点。 */
export function isSvelteKitDataPath(pathname: string): boolean {
  return pathname === ROOT_DATA_PATH || pathname.endsWith(DATA_SUFFIX)
}

/** 判断路径是否属于 transport 保护范围。 */
export function shouldHandleTransportPath(
  pathname: string,
  keyExchangePath: string = DEFAULT_TRANSPORT_KEY_EXCHANGE_PATH,
): boolean {
  return pathname === keyExchangePath || pathname.startsWith(API_PREFIX) || isSvelteKitDataPath(pathname)
}

/** 判断路径是否应排除 transport。 */
export function shouldExcludeTransportPath(
  pathname: string,
  excludePaths: string[],
  keyExchangePath: string,
): boolean {
  if (pathname === keyExchangePath)
    return true

  return excludePaths.some((excludePath) => {
    const normalizedPath = normalizePath(excludePath)
    return pathname === normalizedPath || pathname.startsWith(`${normalizedPath}/`)
  })
}

/** 从相对/绝对 URL 中提取 pathname。 */
export function resolveTransportPath(urlOrPath: string, origin = 'http://localhost'): string {
  return new URL(urlOrPath, origin).pathname
}

/**
 * 判断浏览器侧请求是否应走 transport。
 *
 * - 仅处理同源请求
 * - 仅保护 `/api/*` 与 SvelteKit `__data.json`
 * - 命中 `excludePaths` 时透传明文
 */
export function shouldUseTransportForUrl(
  url: string | URL,
  options: {
    origin?: string
    keyExchangePath?: string
    excludePaths?: string[]
  } = {},
): boolean {
  const baseOrigin = options.origin ?? 'http://localhost'
  const requestUrl = url instanceof URL ? url : new URL(url, baseOrigin)

  if (options.origin && requestUrl.origin !== options.origin)
    return false

  const keyExchangePath = options.keyExchangePath ?? DEFAULT_TRANSPORT_KEY_EXCHANGE_PATH
  if (!shouldHandleTransportPath(requestUrl.pathname, keyExchangePath))
    return false

  return !shouldExcludeTransportPath(requestUrl.pathname, options.excludePaths ?? [], keyExchangePath)
}
