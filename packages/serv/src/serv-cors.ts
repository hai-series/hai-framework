/**
 * @h-ai/serv — CORS middleware
 *
 * 统一处理 OPTIONS 预检与常规响应的 CORS 头注入，让应用层只保留 origin 白名单策略。
 * @module serv-cors
 */

import type { ServMiddleware } from './pipelines/serv-pipeline-types.js'

/** serv CORS 配置。 */
export interface ServCorsConfig {
  /** 允许的 origin：`'*'`、单个字符串、数组或自定义匹配函数。默认 `'*'`。 */
  readonly origin?: '*' | string | readonly string[] | ((origin: string) => boolean)
  /** 允许的方法。默认 `GET/HEAD/PUT/PATCH/POST/DELETE/OPTIONS`。 */
  readonly methods?: readonly string[]
  /** 允许的请求头；若预检请求带 `Access-Control-Request-Headers`，优先回显该值。 */
  readonly allowedHeaders?: readonly string[]
  /** 暴露给浏览器 JS 的响应头。 */
  readonly exposedHeaders?: readonly string[]
  /** 是否允许携带 credentials（cookie / Authorization）。默认 `false`。 */
  readonly credentials?: boolean
  /** 预检缓存秒数。默认 `86400`。 */
  readonly maxAge?: number
}

const DEFAULT_CORS_METHODS = ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS']
const DEFAULT_CORS_ALLOWED_HEADERS = ['Authorization', 'Content-Type', 'X-Requested-With']
const DEFAULT_CORS_MAX_AGE = 86_400

/** 创建可复用的 CORS middleware。 */
export function cors(config: ServCorsConfig = {}): ServMiddleware {
  const methods = [...(config.methods ?? DEFAULT_CORS_METHODS)]
  const allowedHeaders = [...(config.allowedHeaders ?? DEFAULT_CORS_ALLOWED_HEADERS)]
  const exposedHeaders = [...(config.exposedHeaders ?? [])]
  const credentials = config.credentials ?? false
  const maxAge = config.maxAge ?? DEFAULT_CORS_MAX_AGE
  const originConfig = config.origin ?? '*'

  return async (c, next) => {
    const allowedOrigin = resolveCorsOrigin(c.req.header('Origin'), originConfig)

    if (c.req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: buildCorsHeaders({
          allowedOrigin,
          allowedHeaders,
          credentials,
          exposedHeaders,
          maxAge,
          methods,
          request: c.req.raw,
        }),
      })
    }

    await next()

    const corsHeaders = buildCorsHeaders({
      allowedOrigin,
      allowedHeaders,
      credentials,
      exposedHeaders,
      maxAge,
      methods,
      request: c.req.raw,
    })
    for (const [key, value] of corsHeaders) {
      if (key.toLowerCase() === 'vary') {
        c.res.headers.append(key, value)
        continue
      }
      c.res.headers.set(key, value)
    }

    return undefined
  }
}

function resolveCorsOrigin(
  origin: string | undefined,
  configOrigin: NonNullable<ServCorsConfig['origin']>,
): string | null {
  if (!origin)
    return null

  if (configOrigin === '*')
    return '*'

  if (typeof configOrigin === 'string')
    return origin === configOrigin ? origin : null

  if (Array.isArray(configOrigin))
    return configOrigin.includes(origin) ? origin : null

  if (typeof configOrigin === 'function')
    return configOrigin(origin) ? origin : null

  return null
}

function buildCorsHeaders(options: {
  allowedOrigin: string | null
  allowedHeaders: readonly string[]
  credentials: boolean
  exposedHeaders: readonly string[]
  maxAge: number
  methods: readonly string[]
  request: Request
}): Headers {
  const headers = new Headers()
  if (!options.allowedOrigin)
    return headers

  const requestedHeaders = options.request.headers.get('Access-Control-Request-Headers')

  headers.set('Access-Control-Allow-Origin', options.allowedOrigin)
  if (options.credentials)
    headers.set('Access-Control-Allow-Credentials', 'true')

  if (options.allowedOrigin !== '*') {
    headers.set(
      'Vary',
      requestedHeaders ? 'Origin, Access-Control-Request-Headers' : 'Origin',
    )
  }

  if (options.exposedHeaders.length > 0)
    headers.set('Access-Control-Expose-Headers', options.exposedHeaders.join(', '))

  if (options.request.method === 'OPTIONS') {
    headers.set('Access-Control-Allow-Methods', options.methods.join(', '))
    headers.set('Access-Control-Allow-Headers', requestedHeaders ?? options.allowedHeaders.join(', '))
    headers.set('Access-Control-Max-Age', String(options.maxAge))
  }

  return headers
}
