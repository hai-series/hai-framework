/**
 * @h-ai/kit — 传输加密路径匹配工具
 *
 * 统一定义哪些同源请求应纳入 transport 保护范围，供服务端 middleware
 * 与浏览器端 fetch 包装共同复用，避免两端判断漂移。
 * @module kit-transport-paths
 */

import { TRANSPORT_PROTOCOL } from '@h-ai/crypto'

/**
 * 客户端与服务端共用的默认公开密钥交换路径。
 * @example 模块内部上下文
 * ```ts
 * const endpoint = new URL(DEFAULT_TRANSPORT_KEY_EXCHANGE_PATH, 'https://app.example.com')
 * void endpoint.pathname
 * ```
 */
export const DEFAULT_TRANSPORT_KEY_EXCHANGE_PATH = `/api${TRANSPORT_PROTOCOL.DEFAULT_KEY_EXCHANGE_PATH}`

const API_PREFIX = '/api/'
const ROOT_DATA_PATH = '/__data.json'
const DATA_SUFFIX = '/__data.json'

function normalizePath(pathname: string): string {
  return pathname.startsWith('/') ? pathname : `/${pathname}`
}

/**
 * 初始化时校验宿主挂载目录，统一为无末尾斜杠的 URL pathname；请求阶段不重复解析。
 * @param value - 可信宿主的构建目录，域名根目录为空字符串。
 * @returns 已规范化的挂载目录。
 * @throws TypeError 目录包含转义分隔符、点段、查询、片段或控制字符。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const basePath = normalizeTransportBasePath('/console/')
 * const endpoint = `${basePath}/api/articles`
 * ```
 */
export function normalizeTransportBasePath(value = ''): string {
  const invalid = () => new TypeError('Transport basePath must be an absolute mount path without dot segments, query or fragment')
  if (value.includes('//') || /[\\?#\p{Cc} ]/u.test(value) || /%(?:2f|5c|25)/i.test(value))
    throw invalid()
  const basePath = value.replace(/\/$/, '')
  if (!basePath)
    return ''
  if (!basePath.startsWith('/'))
    throw invalid()
  try {
    const decoded = decodeURIComponent(basePath)
    if (/[\\?#\p{Cc} ]/u.test(decoded) || decoded.split('/').some(segment => segment === '.' || segment === '..'))
      throw invalid()
    return new URL(basePath, 'http://kit.invalid').pathname
  }
  catch {
    throw invalid()
  }
}

/**
 * 判断路径是否为 SvelteKit 的页面数据端点。
 * @param pathname - URL pathname，不含 query 或 fragment。
 * @returns 是否是页面 __data.json 端点。
 * @example 模块内部上下文
 * ```ts
 * const isData = isSvelteKitDataPath('/articles/__data.json')
 * void isData
 * ```
 */
export function isSvelteKitDataPath(pathname: string): boolean {
  return pathname === ROOT_DATA_PATH || pathname.endsWith(DATA_SUFFIX)
}

/**
 * 判断路径是否属于 transport 保护范围。
 * @param pathname - 待判断的 URL pathname。
 * @param keyExchangePath - 公开密钥交换路径。
 * @param basePath - 已校验的宿主挂载目录；默认空字符串。
 * @returns 是否属于 API、密钥交换或 SvelteKit 数据端点。
 * @example 模块内部上下文
 * ```ts
 * const protectedPath = shouldHandleTransportPath('/api/articles')
 * void protectedPath
 * ```
 */
export function shouldHandleTransportPath(
  pathname: string,
  keyExchangePath: string = DEFAULT_TRANSPORT_KEY_EXCHANGE_PATH,
  basePath = '',
): boolean {
  if (pathname === keyExchangePath)
    return true
  if (basePath && pathname !== basePath && !pathname.startsWith(`${basePath}/`))
    return false
  return pathname.startsWith(`${basePath}${API_PREFIX}`) || isSvelteKitDataPath(pathname)
}

/**
 * 判断路径是否应排除 transport。
 * @param pathname - 待判断的 URL pathname。
 * @param excludePaths - 按精确路径或子路径前缀排除的列表。
 * @param keyExchangePath - 始终排除加密载荷处理的密钥交换路径。
 * @returns 是否匹配交换端点、排除路径或其子路径。
 * @example 模块内部上下文
 * ```ts
 * const excluded = shouldExcludeTransportPath('/api/health', ['/api/health'], DEFAULT_TRANSPORT_KEY_EXCHANGE_PATH)
 * void excluded
 * ```
 */
export function shouldExcludeTransportPath(
  pathname: string,
  excludePaths: readonly string[],
  keyExchangePath: string,
): boolean {
  if (pathname === keyExchangePath)
    return true

  return excludePaths.some((excludePath) => {
    const normalizedPath = normalizePath(excludePath)
    return pathname === normalizedPath || pathname.startsWith(`${normalizedPath}/`)
  })
}

/**
 * 从相对/绝对 URL 中提取 pathname。
 * @param urlOrPath - 绝对 URL 或相对路径。
 * @param origin - 解析相对路径的基准 origin。
 * @returns 解析后的 pathname；无效 URL 抛出 TypeError。
 * @example 模块内部上下文
 * ```ts
 * const path = resolveTransportPath('https://app.example.com/api/articles?page=1')
 * void path
 * ```
 */
export function resolveTransportPath(urlOrPath: string, origin = 'http://localhost'): string {
  return new URL(urlOrPath, origin).pathname
}

/**
 * 判断浏览器侧请求是否应走 transport。
 *
 * - 仅处理同源请求
 * - 仅保护宿主 basePath 下的 `/api/*` 与 SvelteKit `__data.json`
 * - 命中 `excludePaths` 时透传明文
 * @param url - 待判断的绝对或相对 URL。
 * @param options - 同源基准、密钥交换路径及排除列表。
 * @param options.origin - 当前应用 origin；跨域请求不进入包装。
 * @param options.keyExchangePath - 公开密钥交换路径。
 * @param options.excludePaths - 明文排除路径列表。
 * @param options.basePath - 已校验的宿主挂载目录；默认空字符串。
 * @returns 是否同源、属于保护范围且未被排除。
 * @example 模块内部上下文
 * ```ts
 * const protectedUrl = shouldUseTransportForUrl('/api/articles', { origin: 'https://app.example.com', excludePaths: ['/api/health'] })
 * void protectedUrl
 * ```
 */
export function shouldUseTransportForUrl(
  url: string | URL,
  options: {
    origin?: string
    keyExchangePath?: string
    excludePaths?: readonly string[]
    basePath?: string
  } = {},
): boolean {
  const baseOrigin = options.origin ?? 'http://localhost'
  const requestUrl = url instanceof URL ? url : new URL(url, baseOrigin)

  if (options.origin && requestUrl.origin !== options.origin)
    return false

  const keyExchangePath = options.keyExchangePath ?? DEFAULT_TRANSPORT_KEY_EXCHANGE_PATH
  if (!shouldHandleTransportPath(requestUrl.pathname, keyExchangePath, options.basePath))
    return false

  return !shouldExcludeTransportPath(requestUrl.pathname, options.excludePaths ?? [], keyExchangePath)
}
