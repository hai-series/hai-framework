/**
 * @h-ai/core — Serv 与 Kit 共用的 Fetch CORS 策略。
 * @module core-function-cors
 */

import type { HttpCorsOptions } from '../core-types.js'

/**
 * 未指定方法时使用的浏览器 CORS 预检名单。
 * @example 模块内部上下文
 * ```ts
 * const check = createCors({ methods: DEFAULT_HTTP_CORS_METHODS })
 * ```
 */
export const DEFAULT_HTTP_CORS_METHODS = [
  'GET',
  'HEAD',
  'PUT',
  'PATCH',
  'POST',
  'DELETE',
  'OPTIONS',
] as const
/**
 * 未提供明确允许名单或浏览器请求头时使用的常见请求头。
 * @example 模块内部上下文
 * ```ts
 * const check = createCors({ allowedHeaders: DEFAULT_HTTP_CORS_HEADERS })
 * ```
 */
export const DEFAULT_HTTP_CORS_HEADERS = [
  'Authorization',
  'Content-Type',
  'X-Requested-With',
  'X-Hai-Reauthentication',
  'X-Hai-Terminal',
] as const
/**
 * 默认预检缓存时间，以秒计。
 * @example 模块内部上下文
 * ```ts
 * const check = createCors({ maxAge: DEFAULT_HTTP_CORS_MAX_AGE })
 * ```
 */
export const DEFAULT_HTTP_CORS_MAX_AGE = 86400
const CORS_HEADERS = [
  'Access-Control-Allow-Origin',
  'Access-Control-Allow-Credentials',
  'Access-Control-Allow-Headers',
  'Access-Control-Allow-Methods',
  'Access-Control-Expose-Headers',
  'Access-Control-Max-Age',
] as const

/**
 * 校验固定的完整站点路径，不接受相对部分、编码或通配。
 * @param value - 尚未通过路径校验的输入。
 * @returns 合法路径返回 true，并将值缩窄到绝对路径类型。
 * @example 模块内部上下文
 * ```ts
 * const mountedPath: unknown = '/partners/orders/a2a'
 * if (isHttpEndpointPath(mountedPath)) void mountedPath
 * ```
 */
export function isHttpEndpointPath(value: unknown): value is `/${string}` {
  return typeof value === 'string' && /^\/[\w.-]+(?:\/[\w.-]+)*$/.test(value)
    && value.slice(1).split('/').every(segment => segment !== '.' && segment !== '..')
}

/**
 * 校验 Header 字段名和 HTTP 方法使用的 token 语法。
 * @param value - 单个请求头名称或方法名。
 * @returns 成员合法时返回 true。
 * @example 模块内部上下文
 * ```ts
 * const accepted = ['Authorization', 'X-Request-Id'].every(isHttpToken)
 * ```
 */
export function isHttpToken(value: string): boolean {
  return /^[!#$%&'+.^`|~*\w-]+$/.test(value)
}

/**
 * 判断请求是否为浏览器预检。普通 OPTIONS 继续交给路由处理。
 * @param request - 进入宿主的原始 Fetch Request。
 * @returns 方法为 OPTIONS 且携带来源和目标方法时返回 true。
 * @example
 * ```ts
 * import { core } from '@h-ai/core'
 * const request = new Request('https://api.orders.example.com/api/orders', {
 *   method: 'OPTIONS',
 *   headers: { 'Origin': 'https://console.orders.example.com', 'Access-Control-Request-Method': 'GET' },
 * })
 * const preflight = core.access.isCorsPreflight(request)
 * ```
 */
export function isCorsPreflight(request: Request): boolean {
  return request.method === 'OPTIONS'
    && Boolean(request.headers.get('Origin'))
    && Boolean(request.headers.get('Access-Control-Request-Method'))
}

/**
 * 校验显式完整来源，拒绝路径、用户信息、查询与不支持的协议。
 * @param origin - 配置中的单个来源，包含协议、主机和可选端口。
 * @returns 可规范化为完整来源时返回 true。
 * @example 模块内部上下文
 * ```ts
 * const allowed = isHttpCorsOrigin('https://console.orders.example.com')
 * const rejected = isHttpCorsOrigin('https://console.orders.example.com/reports')
 * ```
 */
export function isHttpCorsOrigin(origin: string): boolean {
  return normalizeOrigin(origin) !== undefined
}

function normalizeOrigin(origin: string): string | undefined {
  if (!/^[a-z]+:\/\/[^\s\\/?#]+\/?$/i.test(origin))
    return undefined
  try {
    const url = new URL(origin)
    if (!url.hostname || url.username || url.password || !['', '/'].includes(url.pathname) || url.search || url.hash)
      return undefined
    return [
      'http:',
      'https:',
      'capacitor:',
      'tauri:',
    ].includes(url.protocol)
      ? `${url.protocol}//${url.host}`
      : undefined
  }
  catch {
    return undefined
  }
}

/**
 * 拆分配置中的逗号分隔来源，移除每一项两侧的空白与空项。
 * @param origins - 尚未拆分的来源字符串。
 * @returns 待进一步校验的来源列表。
 * @example 模块内部上下文
 * ```ts
 * const origins = splitHttpCorsOrigins('capacitor://localhost, tauri://localhost')
 * const allowed = origins.every(isHttpCorsOrigin)
 * ```
 */
export function splitHttpCorsOrigins(origins: string): string[] {
  return origins.split(',').map(origin => origin.trim()).filter(Boolean)
}

function compileOriginCheck(config: HttpCorsOptions): (origin: string) => string | undefined {
  const configured = config.origin ?? '*'
  const native = splitHttpCorsOrigins(config.nativeOrigins ?? '').map(normalizeOrigin)
  if (native.includes(undefined))
    throw new TypeError('CORS requires complete native origins')
  if (typeof configured === 'function') {
    return origin => normalizeOrigin(origin) === origin && (configured(origin) || native.includes(origin))
      ? origin
      : undefined
  }

  const origins = typeof configured === 'string'
    ? splitHttpCorsOrigins(configured)
    : configured
  if (origins.includes('*')) {
    if (config.credentials || origins.length !== 1)
      throw new TypeError('Wildcard CORS cannot be combined with credentials or other origins')
    return origin => origin ? '*' : undefined
  }
  const web = origins.map(normalizeOrigin)
  if (web.includes(undefined))
    throw new TypeError('CORS requires complete, explicit origins')
  const allowed = new Set([
    ...web,
    ...native,
  ])
  return origin => allowed.has(origin)
    ? origin
    : undefined
}

/**
 * 编译一次策略，再按宿主请求计算响应头；前缀按完整路径段匹配。
 * @example
 * ```ts
 * import { core } from '@h-ai/core'
 * const check = core.access.createCors({ origin: 'https://orders.example.com', paths: ['/api'] })
 * const result = check(new Request('https://service.example.com/api/orders'))
 * ```
 */
export function createCors(config: HttpCorsOptions): (request: Request) => { preflight: boolean, headers: Headers } | undefined {
  const allowOrigin = compileOriginCheck(config)
  const { allowedHeaders, credentials, exposedHeaders = [], maxAge = DEFAULT_HTTP_CORS_MAX_AGE, methods = DEFAULT_HTTP_CORS_METHODS } = config
  const paths = config.paths && [...config.paths]
  if (!Number.isSafeInteger(maxAge) || maxAge < 0)
    throw new TypeError('CORS maxAge must be a non-negative integer')
  if (paths?.some(path => path !== '/' && !isHttpEndpointPath(path)))
    throw new TypeError('CORS paths must be complete absolute request paths')
  if (![
    ...methods,
    ...(allowedHeaders ?? []),
    ...exposedHeaders,
  ].every(isHttpToken)) {
    throw new TypeError('Invalid CORS header name or HTTP method')
  }
  const methodHeader = methods.join(', ')
  const allowedHeader = allowedHeaders?.map(header => header.toLowerCase()).join(', ')
  const exposedHeader = [
    ...new Set(['X-Request-Id', 'X-Trace-Id', ...exposedHeaders]),
  ].join(', ')

  return (request) => {
    if (paths) {
      const pathname = new URL(request.url).pathname
      if (!paths.some(path => path === '/' || pathname === path || pathname.startsWith(`${path}/`)))
        return undefined
    }

    const preflight = isCorsPreflight(request)
    const vary = ['Origin']
    if (request.method === 'OPTIONS')
      vary.push('Access-Control-Request-Method')
    if (preflight && allowedHeader === undefined)
      vary.push('Access-Control-Request-Headers')
    const headers = new Headers({
      Vary: vary.join(', '),
    })
    const origin = allowOrigin(request.headers.get('Origin') ?? '')
    if (origin) {
      headers.set('Access-Control-Allow-Origin', origin)
      if (credentials)
        headers.set('Access-Control-Allow-Credentials', 'true')
      headers.set('Access-Control-Expose-Headers', exposedHeader)
      if (preflight) {
        const acceptedHeaders = allowedHeader
          ?? request.headers.get('Access-Control-Request-Headers')
          ?? DEFAULT_HTTP_CORS_HEADERS.join(', ')
        if (acceptedHeaders)
          headers.set('Access-Control-Allow-Headers', acceptedHeaders)
        headers.set('Access-Control-Allow-Methods', methodHeader)
        headers.set('Access-Control-Max-Age', String(maxAge))
      }
    }
    return { preflight, headers }
  }
}

/**
 * 合并 CORS 头；框架或代理生成的只读响应使用原始正文重建。
 * @example
 * ```ts
 * import { core } from '@h-ai/core'
 * const response = core.access.applyCorsHeaders(Response.json({ status: 'ready' }), new Headers({ Vary: 'Origin' }))
 * ```
 */
export function applyCorsHeaders(response: Response, additional: Headers): Response {
  const apply = (headers: Headers) => {
    for (const name of CORS_HEADERS) {
      if (!additional.has(name))
        headers.delete(name)
    }
    for (const [name, value] of additional) {
      if (name !== 'vary') {
        headers.set(name, value)
        continue
      }
      const current = headers.get('vary')?.split(',').map(item => item.trim()) ?? []
      if (current.includes('*'))
        continue
      const unique = new Map([
        ...current,
        ...value.split(',').map(item => item.trim()),
      ].filter(Boolean).map(item => [
        item.toLowerCase(),
        item,
      ]))
      headers.set('vary', [
        ...unique.values(),
      ].join(', '))
    }
  }
  try {
    apply(response.headers)
    return response
  }
  catch {
    const headers = new Headers(response.headers)
    apply(headers)
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
  }
}
