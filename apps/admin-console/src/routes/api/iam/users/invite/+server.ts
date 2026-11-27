import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'
/** 账号与角色提交后发送一次性设密邀请。 */
import { toIamUserResponse } from '#lib/server/iam-admin.js'
import { createInviteUserSchema } from '#lib/server/schemas/index.js'
import { requireAssignableRoles } from '#lib/server/security-roles.js'

export const POST = kit.handler(async (event) => {
  kit.guard.require(event.locals.session, 'user:api:create')
  await kit.guard.requireSensitive(iam, event, 'iam.users.invite')
  const { roles, display_name, ...input } = await kit.validate.body(event.request, createInviteUserSchema())
  await requireAssignableRoles(event.locals.session, roles)
  const created = await iam.user.inviteUser({ ...input, displayName: display_name }, { roleIds: roles })
  if (!created.success)
    return kit.response.fromError(created.error)
  return kit.response.created(await toIamUserResponse(created.data.user))
})
