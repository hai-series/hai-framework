/**
 * @h-ai/serv — 部署环境 HTTP 安全策略
 *
 * 将环境与 CORS 配置收敛为 fail-closed 的运行时策略，避免每个业务应用重复实现
 * Origin 解析、生产通配符保护、Cookie Secure 与 API 文档暴露规则。
 * @module serv-runtime-security
 */

import process from 'node:process'

/**
 * 运行时安全策略输入；通常来自 `_core.yml.env` 与 `_serv.yml.cors`。
 *
 * @example
 * ```ts
 * import type { ServRuntimeSecurityPolicyInput } from '@h-ai/serv'
 * import { serv } from '@h-ai/serv'
 *
 * const input: ServRuntimeSecurityPolicyInput = { environment: 'production', corsOrigin: 'https://app.example.com' }
 * const policy = serv.createRuntimeSecurityPolicy(input)
 * ```
 */
export interface ServRuntimeSecurityPolicyInput {
  readonly environment?: string
  readonly corsOrigin?: string
  readonly nativeOrigins?: string
}

/**
 * 可直接装配到 CORS、refresh cookie 与 HTTP 文档配置的安全策略。
 *
 * @example
 * ```ts
 * import type { ServRuntimeSecurityPolicy } from '@h-ai/serv'
 * import { serv } from '@h-ai/serv'
 *
 * const policy: ServRuntimeSecurityPolicy = serv.createRuntimeSecurityPolicy({ environment: 'production', corsOrigin: 'https://app.example.com' })
 * const allowed = policy.allowOrigin('https://app.example.com')
 * ```
 */
export interface ServRuntimeSecurityPolicy {
  readonly allowOrigin: (origin: string) => boolean
  readonly isNativeOrigin: (origin: string) => boolean
  /** 刷新 Cookie 是否启用 Secure，默认在生产开启。 */
  readonly secureRefreshCookie: boolean
  readonly exposeApiDocs: boolean
}

/**
 * 校验部署 Origin 并生成 Cookie、文档与跨端 CORS 安全策略。
 * `HAI_SERV_REFRESH_COOKIE_SECURE` 可覆盖刷新 Cookie 的 Secure 默认值。
 *
 * @param input - 部署环境与显式允许的 Web/原生 Origin
 * @returns 可用于 HTTP 装配的策略
 * @throws Origin 非法，或 production 缺少明确 Web Origin/使用通配符时抛配置错误。
 *
 * @example
 * ```ts
 * import { serv } from '@h-ai/serv'
 *
 * const policy = serv.createRuntimeSecurityPolicy({ environment: 'production', corsOrigin: 'https://app.example.com' })
 * const middleware = serv.cors({ origin: policy.allowOrigin, credentials: true })
 * ```
 */
export function createRuntimeSecurityPolicy(
  input: ServRuntimeSecurityPolicyInput,
): ServRuntimeSecurityPolicy {
  const production = input.environment?.trim().toLowerCase() === 'production'
  const configuredOrigins = parseOrigins(input.corsOrigin)
  const configuredNativeOrigins = parseNativeOrigins(input.nativeOrigins)
  const allowsEveryOrigin = configuredOrigins === '*'

  if (production && (allowsEveryOrigin || configuredOrigins.length === 0))
    throw new Error('serv.cors.origin must contain explicit HTTP(S) origins in production')

  const allowedOrigins = allowsEveryOrigin ? undefined : new Set(configuredOrigins)
  const allowedNativeOrigins = new Set(configuredNativeOrigins)
  return {
    allowOrigin: (origin) => {
      const normalizedNativeOrigin = tryNormalizeNativeOrigin(origin)
      if (normalizedNativeOrigin !== undefined && allowedNativeOrigins.has(normalizedNativeOrigin))
        return true
      if (allowedOrigins === undefined)
        return true
      const normalizedWebOrigin = tryNormalizeWebOrigin(origin)
      return normalizedWebOrigin !== undefined && allowedOrigins.has(normalizedWebOrigin)
    },
    isNativeOrigin: origin => allowedNativeOrigins.has(tryNormalizeNativeOrigin(origin) ?? ''),
    secureRefreshCookie: resolveSecureRefreshCookie(production),
    exposeApiDocs: !production,
  }
}

/**
 * 读取后端进程的刷新 Cookie 开关。只有精确的 `true` 或 `false` 覆盖环境默认值。
 * @param defaultSecure - 调用方现有的环境默认值
 * @returns 是否为刷新 Cookie 设置 Secure
 * @example 模块内部上下文
 * ```ts
 * // 未设置 HAI_SERV_REFRESH_COOKIE_SECURE 时，生产默认返回 true。
 * const secure = resolveSecureRefreshCookie(true)
 * ```
 */
export function resolveSecureRefreshCookie(defaultSecure: boolean): boolean {
  const override = process.env.HAI_SERV_REFRESH_COOKIE_SECURE
  if (override === 'true' || override === 'false')
    return override === 'true'
  return defaultSecure
}

function parseOrigins(value: string | undefined): '*' | string[] {
  const entries = (value ?? '*').split(',').map(origin => origin.trim()).filter(Boolean)
  if (entries.includes('*'))
    return '*'
  return entries.map(normalizeWebOrigin)
}

function parseNativeOrigins(value: string | undefined): string[] {
  return (value ?? '').split(',').map(origin => origin.trim()).filter(Boolean).map(normalizeNativeOrigin)
}

function normalizeWebOrigin(value: string): string {
  const normalized = tryNormalizeWebOrigin(value)
  if (normalized === undefined)
    throw new Error(`serv.cors.origin contains an invalid origin: ${value}`)
  return normalized
}

function normalizeNativeOrigin(value: string): string {
  const normalized = tryNormalizeNativeOrigin(value)
  if (normalized === undefined)
    throw new Error(`serv.cors.nativeOrigins contains an invalid origin: ${value}`)
  return normalized
}

function tryNormalizeWebOrigin(value: string): string | undefined {
  let url: URL
  try {
    url = new URL(value)
  }
  catch {
    return undefined
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.origin === 'null' || url.pathname !== '/' || url.search || url.hash)
    return undefined
  return url.origin
}

function tryNormalizeNativeOrigin(value: string): string | undefined {
  let url: URL
  try {
    url = new URL(value)
  }
  catch {
    return undefined
  }
  if (!['http:', 'https:', 'capacitor:', 'tauri:'].includes(url.protocol) || !url.hostname || url.username || url.password || !['', '/'].includes(url.pathname) || url.search || url.hash)
    return undefined
  return ['capacitor:', 'tauri:'].includes(url.protocol) ? `${url.protocol}//${url.host}` : url.origin
}
