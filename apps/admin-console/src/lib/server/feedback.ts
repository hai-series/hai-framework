/** 后台单应用示例的可信范围；产品有租户时应替换为已验证的租户上下文。 */
import type { FeedbackContext } from '@h-ai/feedback'
import type { RequestEvent } from '@sveltejs/kit'
import { iam } from '@h-ai/iam'

const FEEDBACK_PERMISSIONS = ['create', 'read', 'process', 'reopen', 'export'] as const

export function getFeedbackContext(event: Pick<RequestEvent, 'locals'>): FeedbackContext | null {
  const session = event.locals.session
  if (!session)
    return null
  return { scopeId: 'admin-console', userId: session.userId, permissions: session.permissions }
}

/** 将反馈权限显式分配到宿主既有角色，不在 feedback 模块内推断 admin。 */
export async function seedFeedbackPermissions(): Promise<void> {
  const admin = await iam.authz.getRoleByCode('admin')
  if (!admin.success)
    throw new Error(admin.error.message)
  const user = await iam.authz.getRoleByCode('user')
  if (!user.success)
    throw new Error(user.error.message)
  for (const action of FEEDBACK_PERMISSIONS) {
    const code = `feedback:${action}`
    let permission = await iam.authz.getPermissionByCode(code)
    if (!permission.success)
      throw new Error(permission.error.message)
    if (!permission.data) {
      permission = await iam.authz.createPermission({ code, name: code, type: 'api', resource: 'feedback', action })
      if (!permission.success)
        throw new Error(permission.error.message)
    }
    if (admin.data && permission.data) {
      const assigned = await iam.authz.assignPermissionToRole(admin.data.id, permission.data.id)
      if (!assigned.success)
        throw new Error(assigned.error.message)
    }
    if (action === 'create' && user.data && permission.data) {
      const assigned = await iam.authz.assignPermissionToRole(user.data.id, permission.data.id)
      if (!assigned.success)
        throw new Error(assigned.error.message)
    }
  }
}
