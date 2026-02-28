import * as m from '$lib/paraglide/messages.js'
import { createChangeCurrentPasswordSchema } from '$lib/server/schemas/index.js'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

/**
 * 通过会话令牌定位当前用户并执行改密。
 *
 * @param token 当前会话令牌
 * @param oldPassword 原密码
 * @param newPassword 新密码
 * @returns 改密执行结果
 */
async function changePasswordByToken(token: string, oldPassword: string, newPassword: string) {
  return iam.user.changeCurrentUserPassword(token, oldPassword, newPassword)
}

/**
 * 修改当前登录用户密码，成功后要求重新登录。
 *
 * @returns 改密结果，成功时返回 `reloginRequired: true`
 */
export const PUT = kit.handler(async ({ cookies, request }) => {
  const token = cookies.get('session_token')
  if (!token) {
    return kit.response.unauthorized(m.common_error())
  }

  const data = await kit.validate.formOrFail(request, createChangeCurrentPasswordSchema())

  const result = await changePasswordByToken(token, data.old_password, data.new_password)

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
