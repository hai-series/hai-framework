/**
 * @h-ai/serv — Pipeline 包装器
 *
 * 提供两类正交的中间件：
 * - Hono middleware：`securityHeaders`、`requireInternalRPC`（HTTP 层切面）
 * - oRPC procedure 包装器：`mapHaiError`、`requireAuth`、`requirePermission`（procedure 层切面）
 *
 * procedure 包装器均返回符合 `HaiResult<T>` 的 handler，支持链式套用。
 * @module serv-pipeline
 */

import type { HaiResult } from '@h-ai/core'
import type { MiddlewareHandler } from 'hono'
import type { ServRpcHttpConfig } from './serv-config.js'
import type { ServContext } from './serv-context.js'
import { Buffer } from 'node:buffer'
import { timingSafeEqual } from 'node:crypto'
import { err, HaiCommonError } from '@h-ai/core'
import { servM } from './serv-i18n.js'
import { resolveRequestLocale } from './serv-validation.js'

const LOOPBACK_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost'])

/** 常量时间比较两个字符串，避免基于时延的密钥推断。 */
function safeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length)
    return false
  return timingSafeEqual(bufA, bufB)
}

/**
 * 构造与 `HaiResult` 失败分支同构的 HTTP 响应体。
 *
 * - 字段顺序与 `haiResultSchema()` 输出一致，便于客户端统一解析。
 * - 仅暴露最小信息（code/message/httpStatus），避免泄漏内部细节。
 */
export function buildHaiErrorBody(def: { code: string | number, httpStatus: number, system: string, module: string }, message: string) {
  return {
    success: false as const,
    error: {
      code: def.code,
      message,
      httpStatus: def.httpStatus,
      system: def.system,
      module: def.module,
    },
  }
}

// ─────────────────────────────────────────────
// Hono middleware
// ─────────────────────────────────────────────

/**
 * 添加基础安全响应头：
 * `X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Referrer-Policy: no-referrer`。
 *
 * @returns Hono middleware
 */
export function securityHeaders(): MiddlewareHandler {
  return async (c, next) => {
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('X-Frame-Options', 'DENY')
    c.header('Referrer-Policy', 'no-referrer')
    await next()
  }
}

/**
 * 限制内部 RPC 入口来源。
 *
 * 应用层兜底校验；生产仍应优先依赖内网、服务网格或网关策略。
 *
 * @param config - RPC 访问控制配置
 * @returns Hono middleware
 *
 * @example
 * ```ts
 * app.use('/rpc/*', serv.requireInternalRPC({ prefix: '/rpc', access: 'loopback' }))
 * ```
 */
export function requireInternalRPC(config: ServRpcHttpConfig): MiddlewareHandler {
  return async (c, next) => {
    const locale = resolveRequestLocale(c.req.raw.headers)

    if (config.access === 'gateway-only') {
      const headerName = config.gatewayHeader ?? 'x-hai-internal-rpc'
      const received = c.req.header(headerName)
      if (!config.gatewaySecret || !received || !safeStringEqual(received, config.gatewaySecret))
        return c.json(buildHaiErrorBody(HaiCommonError.FORBIDDEN, servM('serv_errorForbidden', { locale })), 403)
      return next()
    }

    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
      ?? c.req.header('x-real-ip')
      ?? ''

    if (config.access === 'loopback' && !LOOPBACK_IPS.has(ip))
      return c.json(buildHaiErrorBody(HaiCommonError.FORBIDDEN, servM('serv_errorForbidden', { locale })), 403)

    if (config.access === 'private-network' && !isPrivateNetworkIP(ip))
      return c.json(buildHaiErrorBody(HaiCommonError.FORBIDDEN, servM('serv_errorForbidden', { locale })), 403)

    return next()
  }
}

function isPrivateNetworkIP(ip: string): boolean {
  if (LOOPBACK_IPS.has(ip))
    return true
  if (ip.startsWith('10.') || ip.startsWith('192.168.'))
    return true
  const second = Number(ip.split('.')[1])
  return ip.startsWith('172.') && Number.isInteger(second) && second >= 16 && second <= 31
}

// ─────────────────────────────────────────────
// oRPC procedure 包装器
// ─────────────────────────────────────────────

/** oRPC procedure handler 的最小上下文约束。 */
export interface ServProcedureOptions<TInput = unknown> {
  readonly input: TInput
  readonly context: ServContext
}

/** oRPC procedure handler。 */
export type ServProcedureHandler<TInput, TOutput> = (
  options: ServProcedureOptions<TInput>,
) => HaiResult<TOutput> | Promise<HaiResult<TOutput>>

/**
 * 捕获未处理异常并转换为 HaiResult。
 *
 * 通常作为最外层包装器使用；就算内层抛出异常，也不会泄漏到 HTTP 层。
 *
 * @param handler - 被包装的 procedure handler
 * @returns 带异常保护的新 handler
 *
 * @example
 * ```ts
 * const safeHandler = serv.mapHaiError(myHandler)
 * ```
 */
export function mapHaiError<TInput, TOutput>(handler: ServProcedureHandler<TInput, TOutput>): ServProcedureHandler<TInput, TOutput> {
  return async (options) => {
    try {
      return await handler(options)
    }
    catch (error) {
      return err(HaiCommonError.INTERNAL_ERROR, servM('serv_errorInternal', { locale: options.context.locale }), error)
    }
  }
}

/**
 * 需要已验证会话的 procedure 包装器。
 *
 * `context.session` 由 `buildAuthContextFactory(verifyToken)`（或 `serv.createApp({ iam })` 自动启用）填充。
 * token 不存在或无效（verifyToken 失败）时 `session` 均为 `undefined`，统一返回 401 UNAUTHORIZED。
 * 内置调用 `mapHaiError`，无需外层再次封装。
 *
 * @param handler - 被包装的 procedure handler
 * @returns 带认证检查的新 handler
 *
 * @example
 * ```ts
 * const protectedHandler = serv.requireAuth(myHandler)
 * ```
 */
export function requireAuth<TInput, TOutput>(handler: ServProcedureHandler<TInput, TOutput>): ServProcedureHandler<TInput, TOutput> {
  return mapHaiError(async (options) => {
    if (!options.context.session)
      return err(HaiCommonError.UNAUTHORIZED, servM('serv_errorUnauthorized', { locale: options.context.locale }))
    return handler(options)
  })
}

/**
 * 通配符权限：拥有此权限的用户自动通过所有 {@link requirePermission} 检查。
 * 用于超级管理员场景。**禁止**普通用户被分配此权限。
 */
export const WILDCARD_PERMISSION = '*'

/**
 * 通配符角色：拥有此角色的用户自动通过所有 {@link requireRole} 检查。
 * 用于超级管理员场景。**禁止**普通用户被分配此角色。
 */
export const WILDCARD_ROLE = '*'

/**
 * 需要指定权限的 procedure 包装器。
 *
 * 内置调用 `requireAuth`，在验证 Token 后进一步匹配 `session.permissions`。
 * 拥有 {@link WILDCARD_PERMISSION}（`'*'`）的用户自动通过所有权限检查。
 *
 * @param permission - 所需权限字符串（如 `'iam.users.read'`）
 * @param handler - 被包装的 procedure handler
 * @returns 带权限检查的新 handler
 *
 * @example
 * ```ts
 * const adminHandler = serv.requirePermission('iam.users.write', myHandler)
 * ```
 */
export function requirePermission<TInput, TOutput>(
  permission: string,
  handler: ServProcedureHandler<TInput, TOutput>,
): ServProcedureHandler<TInput, TOutput> {
  return requireAuth(async (options) => {
    const permissions = options.context.session?.permissions ?? []
    if (!permissions.includes(permission) && !permissions.includes(WILDCARD_PERMISSION))
      return err(HaiCommonError.FORBIDDEN, servM('serv_errorForbidden', { locale: options.context.locale }))
    return handler(options)
  })
}

/**
 * 需要指定角色的 procedure 包装器。
 *
 * 内置调用 `requireAuth`，在验证 Token 后进一步匹配 `session.roles`。
 * 拥有 {@link WILDCARD_ROLE}（`'*'`）的用户自动通过所有角色检查。
 *
 * **使用建议**：优先使用 {@link requirePermission}（基于行为的细粒度授权）；
 * `requireRole` 适用于按角色分流的粗粒度路由（如 `'admin'` 专属入口）。
 *
 * @param role - 所需角色字符串（如 `'admin'`）
 * @param handler - 被包装的 procedure handler
 * @returns 带角色检查的新 handler
 *
 * @example
 * ```ts
 * const adminOnly = serv.requireRole('admin', myHandler)
 * ```
 */
export function requireRole<TInput, TOutput>(
  role: string,
  handler: ServProcedureHandler<TInput, TOutput>,
): ServProcedureHandler<TInput, TOutput> {
  return requireAuth(async (options) => {
    const roles = options.context.session?.roles ?? []
    if (!roles.includes(role) && !roles.includes(WILDCARD_ROLE))
      return err(HaiCommonError.FORBIDDEN, servM('serv_errorForbidden', { locale: options.context.locale }))
    return handler(options)
  })
}
