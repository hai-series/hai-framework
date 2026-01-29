/**
 * =============================================================================
 * @hai/kit - CORS 中间件
 * =============================================================================
 * 跨域资源共享处理
 * =============================================================================
 */

import type { CorsConfig, Middleware } from '../types.js'

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
 * 获取允许的源
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
 * 获取 CORS 响应头
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
