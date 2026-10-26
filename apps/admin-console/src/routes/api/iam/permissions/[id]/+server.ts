import * as m from '$lib/paraglide/messages.js'
/**
 * =============================================================================
 * Admin Console - 单个权限管理 API
 * =============================================================================
 */

import { deleteAdminPermission, getAdminPermission } from '$lib/server/iam-admin.js'
import { IdParamSchema } from '$lib/server/schemas/index.js'
import { requireManageablePermission } from '$lib/server/security-roles.js'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

/**
 * DELETE /api/iam/permissions/[id] - 删除权限
 *
 * 需要权限：permission:api:delete
 */
export const DELETE = kit.handler(async ({ params, locals, request, cookies }) => {
  const locale = locals.locale === 'en-US' ? 'en-US' : locals.locale === 'ja-JP' ? 'ja-JP' : 'zh-CN'
  kit.guard.require(locals.session, 'permission:api:delete')
  await kit.guard.requireSensitive(iam, { request, cookies }, 'iam.permissions.delete')

  const { id: permId } = kit.validate.params(params, IdParamSchema)

  // 检查权限是否存在
  const existing = await getAdminPermission(permId)
  if (!existing) {
    return kit.response.notFound(m.api_iam_permissions_not_found({}, { locale }))
  }

  // 系统权限不可删除
  if (existing.is_system) {
    return kit.response.badRequest(m.api_iam_permissions_system_cannot_delete({}, { locale }))
  }
  await requireManageablePermission(locals.session, existing.code)

  // 删除权限（IAM authz 内部已记录审计日志）
  const deleteResult = await deleteAdminPermission(permId)
  if (!deleteResult.success) {
    return kit.response.fromError(deleteResult.error)
  }

  return kit.response.ok(null)
})
