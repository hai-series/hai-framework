/**
 * @h-ai/serv — 请求上下文创建
 *
 * 提供默认的 `ServContext` 工层：从 HTTP header 中解析
 * requestId、locale、IP、accessToken 等元数据。
 * 应用层可通过 `createApp({ createContext })` 注入自定义工层以附加 session。
 * @module context/create-context
 */

import type { CreateServContextInput, ServContext } from './context-types.js'
import { core } from '@h-ai/core'

const HEADER_REQUEST_ID = 'x-request-id'
const HEADER_FORWARDED_FOR = 'x-forwarded-for'
const HEADER_REAL_IP = 'x-real-ip'
const HEADER_LOCALE = 'accept-language'
const HEADER_AUTHORIZATION = 'authorization'
const HEADER_USER_AGENT = 'user-agent'

/**
 * 从 Authorization header 中提取 Bearer token。
 *
 * @param value - Authorization header 原始值
 * @returns token 或 undefined
 */
export function extractBearerToken(value: string | null): string | undefined {
  if (!value) {
    return undefined
  }

  const [scheme, token] = value.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return undefined
  }

  return token
}

/**
 * 创建默认 ServContext。
 *
 * 默认只解析 HTTP 元信息和 accessToken；session 可由应用自定义 context factory 注入。
 *
 * @param input - 上下文输入
 * @returns ServContext
 *
 * @example
 * ```ts
 * // 注入自定义 context（增加 session）
 * createApp({
 *   contract,
 *   procedures,
 *   createContext: async (input) => ({
 *     ...createContext(input),
 *     session: await iam.session.verifyAccessToken(input.request.headers.get('authorization')),
 *   }),
 * })
 * ```
 */
export function createContext(input: CreateServContextInput): ServContext {
  const headers = input.request.headers
  const requestId = headers.get(HEADER_REQUEST_ID) ?? core.id.uuid()
  const forwardedFor = headers.get(HEADER_FORWARDED_FOR)
  const ip = headers.get(HEADER_REAL_IP) ?? forwardedFor?.split(',')[0]?.trim()
  const locale = headers.get(HEADER_LOCALE)?.split(',')[0]?.trim() || 'zh-CN'
  const accessToken = extractBearerToken(headers.get(HEADER_AUTHORIZATION))

  return {
    requestId,
    locale,
    ip,
    userAgent: headers.get(HEADER_USER_AGENT) ?? undefined,
    accessToken,
    request: input.request,
    logger: core.logger.child({ module: 'serv', requestId }),
  }
}
