import * as m from '$lib/paraglide/messages.js'
import { createChangeCurrentPasswordSchema } from '$lib/server/schemas/index.js'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

/**
 * 修改当前登录用户密码，成功后要求重新登录。
 */
export const PUT = kit.handler(async ({ cookies, request }) => {
  const token = cookies.get('hai_session')
  if (!token) {
    return kit.response.unauthorized(m.common_error())
  }

  const data = await kit.validate.formOrFail(request, createChangeCurrentPasswordSchema())
  const result = await iam.user.changeCurrentUserPassword(token, data.old_password, data.new_password)

  if (!result.success) {
    return kit.response.badRequest(
      result.error.message,
      undefined,
      { fieldErrors: { general: result.error.message } },
    )
  }

  kit.session.clearCookie(cookies)
  return kit.response.ok({ reloginRequired: true })
})
