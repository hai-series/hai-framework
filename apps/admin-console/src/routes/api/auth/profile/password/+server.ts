import * as m from '$lib/paraglide/messages.js'
import { createChangeCurrentPasswordSchema } from '$lib/server/schemas/index.js'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

/**
 * 修改当前登录用户密码，成功后要求重新登录。
 */
export const PUT = kit.handler(async ({ request, locals }) => {
  if (!locals.accessToken) {
    return kit.response.unauthorized(m.common_error())
  }

  const data = await kit.validate.formOrFail(request, createChangeCurrentPasswordSchema())
  const result = await iam.user.changeCurrentUserPassword(locals.accessToken, data.old_password, data.new_password)

  if (!result.success) {
    return kit.response.badRequest(
      result.error.message,
      undefined,
      { fieldErrors: { general: result.error.message } },
    )
  }

  return kit.response.ok({ reloginRequired: true })
})
