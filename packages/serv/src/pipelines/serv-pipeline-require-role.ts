/**
 * @h-ai/serv — requireRole 默认实现
 * @module pipelines/serv-pipeline-require-role
 */

import type { ServProcedureHandler } from './serv-pipeline-types.js'
import { err, HaiCommonError } from '@h-ai/core'
import { servM } from '../serv-i18n.js'
import { requireAuth } from './serv-pipeline-require-auth.js'

/**
 * 通配符角色：拥有此角色的用户自动通过所有 {@link requireRole} 检查。
 * 用于超级管理员场景。**禁止**普通用户被分配此角色。
 */
export const WILDCARD_ROLE = '*'

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
    // 先认证，再检查角色；通配符角色保留给超级管理员场景。
    const roles = options.context.session?.roles ?? []
    if (!roles.includes(role) && !roles.includes(WILDCARD_ROLE))
      return err(HaiCommonError.FORBIDDEN, servM('serv_errorForbidden', { locale: options.context.locale }))
    return handler(options)
  })
}
