/**
 * @h-ai/kit — CORS 中间件
 *
 * 配置跨域资源共享（CORS）策略，自动处理 OPTIONS 预检请求与响应头注入。 支持精确 origin / 通配符 / 函数匹配三种模式。
 * @module kit-cors
 */

import type { CorsConfig, Middleware } from '../kit-types.js'

/**
 * 默认 CORS 配置
 */
const defaultConfig: Required<CorsConfig> = {
  origin: '*',
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: [],
  credentials: false,
  maxAge: 86400,
}

/**
 * 创建 CORS 中间件
 *
 * 处理跨域资源共享：
 * - OPTIONS 预检请求返回 204 + CORS 头
 * - 其他请求在业务响应上附加 CORS 头
 *
 * @param config - CORS 配置（省略则允许所有 origin）
 * @returns Middleware 实例
 *
 * @example
 * ```ts
 * middleware: [
 *   kit.middleware.cors({ origin: ['https://example.com'], credentials: true }),
 * ]
 * ```
 */
export function corsMiddleware(config: CorsConfig = {}): Middleware {
  const mergedConfig = { ...defaultConfig, ...config }

  return async (context, next) => {
    const { event } = context
    const origin = event.request.headers.get('origin') ?? ''

    // 检查是否允许该源
    const allowedOrigin = getAllowedOrigin(origin, mergedConfig.origin)

    // 处理预检请求
    if (event.request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: getCorsHeaders(allowedOrigin, mergedConfig, event.request),
      })
    }

    const response = await next()

    // 添加 CORS 头
    const corsHeaders = getCorsHeaders(allowedOrigin, mergedConfig, event.request)
    for (const [key, value] of corsHeaders) {
      response.headers.set(key, value)
    }

    return response
  }
}

/**
 * 计算允许的 origin
 *
 * @param origin - 请求中的 Origin 头
 * @param configOrigin - 配置的允许规则（'*'、字符串、数组或函数）
 * @returns 匹配到的 origin 或 null
 */
function getAllowedOrigin(
  origin: string,
  configOrigin: string | string[] | ((origin: string) => boolean),
): string | null {
  if (configOrigin === '*') {
    return '*'
  }

  if (typeof configOrigin === 'string') {
    return origin === configOrigin ? origin : null
  }

  if (Array.isArray(configOrigin)) {
    return configOrigin.includes(origin) ? origin : null
  }

  if (typeof configOrigin === 'function') {
    return configOrigin(origin) ? origin : null
  }

  return null
}

/**
 * 构建 CORS 响应头
 *
 * 预检请求时额外设置 `Allow-Methods`、`Allow-Headers`、`Max-Age`。
 *
 * @param allowedOrigin - 已匹配的 origin（null 则返回空 Headers）
 * @param config - 已合并的完整 CORS 配置
 * @param request - 原始 Request（用于判断是否为 OPTIONS）
 * @returns Headers 对象
 */
function getCorsHeaders(
  allowedOrigin: string | null,
  config: Required<CorsConfig>,
  request: Request,
): Headers {
  const headers = new Headers()

  if (!allowedOrigin) {
    return headers
  }

  headers.set('Access-Control-Allow-Origin', allowedOrigin)

  if (config.credentials) {
    headers.set('Access-Control-Allow-Credentials', 'true')
  }

  if (config.exposedHeaders.length > 0) {
    headers.set('Access-Control-Expose-Headers', config.exposedHeaders.join(', '))
  }

  // 预检请求头
  if (request.method === 'OPTIONS') {
    headers.set('Access-Control-Allow-Methods', config.methods.join(', '))
    headers.set('Access-Control-Allow-Headers', config.allowedHeaders.join(', '))
    headers.set('Access-Control-Max-Age', String(config.maxAge))
  }

  return headers
}
