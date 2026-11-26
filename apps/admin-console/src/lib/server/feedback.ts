/** 后台单应用示例的可信范围；产品有租户时应替换为已验证的租户上下文。 */
import type { FeedbackContext } from '@h-ai/feedback'
import type { RequestEvent } from '@sveltejs/kit'
import { core, HaiCommonError } from '@h-ai/core'
import { iam } from '@h-ai/iam'

const FEEDBACK_PERMISSIONS = [
  'create',
  'read',
  'process',
] as const
export const feedbackScope = 'admin-console'

export function getFeedbackContext(event: Pick<RequestEvent, 'locals'>): FeedbackContext | null {
  const session = event.locals.session
  if (!session)
    return null
  return { scopeId: feedbackScope, userId: session.userId, permissions: session.permissions }
}

/** 将反馈权限显式分配到宿主业务操作员角色，不在 feedback 模块内推断系统管理员。 */
export async function seedFeedbackPermissions() {
  const operator = await iam.authz.getRoleByCode('business_operator')
  if (!operator.success)
    return operator
  const user = await iam.authz.getRoleByCode('user')
  if (!user.success)
    return user
  if (!operator.data || !user.data)
    return core.err(HaiCommonError.INTERNAL_ERROR)
  for (const action of FEEDBACK_PERMISSIONS) {
    const code = `feedback:${action}`
    let permission = await iam.authz.getPermissionByCode(code)
    if (!permission.success)
      return permission
    if (!permission.data) {
      permission = await iam.authz.createPermission({
        code,
        name: code,
        type: 'api',
        resource: 'feedback',
        action,
      })
      if (!permission.success) {
        // 其他实例可能同时创建了同一权限。
        permission = await iam.authz.getPermissionByCode(code)
        if (!permission.success)
          return permission
      }
    }
    if (!permission.data)
      return core.err(HaiCommonError.INTERNAL_ERROR)
    const operatorAssigned = await iam.authz.assignPermissionToRole(operator.data.id, permission.data.id)
    if (!operatorAssigned.success)
      return operatorAssigned
    if (action === 'create') {
      const assigned = await iam.authz.assignPermissionToRole(user.data.id, permission.data.id)
      if (!assigned.success)
        return assigned
    }
  }
  return core.ok(undefined)
}
