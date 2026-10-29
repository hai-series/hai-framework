/** 管理端一次性设密邀请；投递后发生配置失败时保留账号供修复。 */
import { toIamUserResponse } from '$lib/server/iam-admin.js'
import { createInviteUserSchema } from '$lib/server/schemas/index.js'
import { requireAssignableRoles } from '$lib/server/security-roles.js'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

export const POST = kit.handler(async (event) => {
  kit.guard.require(event.locals.session, 'user:api:create')
  await kit.guard.requireSensitive(iam, event, 'iam.users.invite')
  const { roles, display_name, ...input } = await kit.validate.body(event.request, createInviteUserSchema())
  await requireAssignableRoles(event.locals.session, roles)
  const created = await iam.user.inviteUser({ ...input, displayName: display_name })
  if (!created.success)
    return kit.response.fromError(created.error)
  if (roles) {
    const assigned = await iam.authz.syncRoles(created.data.user.id, roles)
    if (!assigned.success)
      return kit.response.fromError(assigned.error)
  }
  return kit.response.created(await toIamUserResponse(created.data.user))
})
