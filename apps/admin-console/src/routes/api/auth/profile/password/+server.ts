import type { RequestHandler } from '@sveltejs/kit'
import * as m from '$lib/paraglide/messages.js'
import { ChangeCurrentPasswordSchema } from '$lib/server/schemas/index.js'
import { core } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'
import { json } from '@sveltejs/kit'

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
export const PUT: RequestHandler = async ({ cookies, request }) => {
  try {
    const token = cookies.get('session_token')
    if (!token) {
      return json({ success: false, error: m.common_error() }, { status: 401 })
    }

    const { valid, data, errors } = await kit.validate.form(request, ChangeCurrentPasswordSchema)
    if (!valid) {
      const fieldErrors = Object.fromEntries(
        errors.map(error => [error.field, error.message]),
      )
      return json({
        success: false,
        error: errors[0]?.message ?? m.common_error(),
        fieldErrors,
      }, { status: 400 })
    }

    const result = await changePasswordByToken(token, data!.old_password, data!.new_password)

    if (!result.success) {
      return json({
        success: false,
        error: result.error.message,
        fieldErrors: { general: result.error.message },
      }, { status: 400 })
    }

    cookies.delete('session_token', { path: '/' })
    return json({
      success: true,
      reloginRequired: true,
    })
  }
  catch (error) {
    core.logger.error('Failed to change current user password', { error })
    return json({ success: false, error: m.common_error() }, { status: 500 })
  }
}
