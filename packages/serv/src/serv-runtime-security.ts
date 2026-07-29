/**
 * @h-ai/serv — 部署环境 HTTP 安全策略
 *
 * 将环境与 CORS 配置收敛为 fail-closed 的运行时策略，避免每个业务应用重复实现
 * Origin 解析、生产通配符保护、Cookie Secure 与 API 文档暴露规则。
 * @module serv-runtime-security
 */

/** 运行时安全策略输入；通常来自 `_core.yml.env` 与 `_serv.yml.cors`。 */
export interface ServRuntimeSecurityPolicyInput {
  readonly environment?: string
  readonly corsOrigin?: string
  readonly nativeOrigins?: string
}

/** 可直接装配到 CORS、refresh cookie 与 HTTP 文档配置的安全策略。 */
export interface ServRuntimeSecurityPolicy {
  readonly allowOrigin: (origin: string) => boolean
  readonly isNativeOrigin: (origin: string) => boolean
  readonly secureRefreshCookie: boolean
  readonly exposeApiDocs: boolean
}

/**
 * 创建部署环境安全策略。
 *
 * 生产环境必须显式配置 HTTP(S) Origin，禁止缺省或 `*`；开发环境保留通配符便利性。
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
    secureRefreshCookie: production,
    exposeApiDocs: !production,
  }
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
