/**
 * @h-ai/serv — requirePermission 默认实现
 * @module pipelines/serv-pipeline-require-permission
 */

import type { ServProcedureHandler } from './serv-pipeline-types.js'
import { err, HaiCommonError } from '@h-ai/core'
import { servM } from '../serv-i18n.js'
import { requireAuth } from './serv-pipeline-require-auth.js'

/**
 * 通配符权限：拥有此权限的用户自动通过所有 {@link requirePermission} 检查。
 * 用于超级管理员场景。**禁止**普通用户被分配此权限。
 */
export const WILDCARD_PERMISSION = '*'

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
    // 先认证，再鉴权；未登录请求在 requireAuth 中已经被挡住。
    const permissions = options.context.session?.permissions ?? []
    if (!permissions.includes(permission) && !permissions.includes(WILDCARD_PERMISSION))
      return err(HaiCommonError.FORBIDDEN, servM('serv_errorForbidden', { locale: options.context.locale }))
    return handler(options)
  })
}
