/**
 * @h-ai/kit — CORS 中间件
 *
 * 配置跨域资源共享（CORS）策略，自动处理 OPTIONS 预检请求与响应头注入。
 * 支持精确 origin、数组白名单、通配符模式与函数匹配四种模式。
 * 自动预置 Capacitor WebView origin（Android/iOS）。
 * @module kit-cors
 */

import type { CorsConfig, Middleware } from '../kit-types.js'

/** Capacitor WebView 预置 origin */
const CAPACITOR_ORIGINS = [
  'capacitor://localhost',
  'http://localhost',
]

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
  capacitor: true,
}

/**
 * 创建 CORS 中间件
 *
 * 处理跨域资源共享：
 * - OPTIONS 预检请求返回 204 + CORS 头
 * - 其他请求在业务响应上附加 CORS 头
 * - 默认预置 Capacitor WebView origin
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
    const allowedOrigin = getAllowedOrigin(origin, mergedConfig.origin, mergedConfig.capacitor !== false)

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
 * 支持通配符模式（如 `*.example.com`）匹配子域名。
 *
 * @param origin - 请求中的 Origin 头
 * @param configOrigin - 配置的允许规则（'*'、字符串、数组或函数）
 * @param includeCapacitor - 是否包含 Capacitor 预置 origin
 * @returns 匹配到的 origin 或 null
 */
function getAllowedOrigin(
  origin: string,
  configOrigin: string | string[] | ((origin: string) => boolean),
  includeCapacitor: boolean,
): string | null {
  if (configOrigin === '*') {
    return '*'
  }

  // Capacitor 预置 origin 总是被允许
  if (includeCapacitor && CAPACITOR_ORIGINS.includes(origin)) {
    return origin
  }

  if (typeof configOrigin === 'string') {
    return matchWildcardOrigin(origin, configOrigin) ? origin : null
  }

  if (Array.isArray(configOrigin)) {
    return configOrigin.some(pattern => matchWildcardOrigin(origin, pattern)) ? origin : null
  }

  if (typeof configOrigin === 'function') {
    return configOrigin(origin) ? origin : null
  }

  return null
}

/**
 * 通配符 origin 匹配
 *
 * 支持 `*.example.com` 匹配 `sub.example.com`。
 *
 * @param origin - 实际 origin
 * @param pattern - 匹配模式
 * @returns 是否匹配
 */
function matchWildcardOrigin(origin: string, pattern: string): boolean {
  if (origin === pattern) {
    return true
  }
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(1) // '.example.com'
    return origin.endsWith(suffix) || origin === `https://${pattern.slice(2)}` || origin === `http://${pattern.slice(2)}`
  }
  return false
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
