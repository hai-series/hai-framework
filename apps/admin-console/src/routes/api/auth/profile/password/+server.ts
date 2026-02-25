import type { RequestHandler } from '@sveltejs/kit'
import * as m from '$lib/paraglide/messages.js'
import { ChangeCurrentPasswordSchema } from '$lib/server/schemas/index.js'
import { core } from '@hai/core'
import { iam } from '@hai/iam'
import { kit } from '@hai/kit'
import { json } from '@sveltejs/kit'

/**
 * 兼容不同 iam 版本的改密能力。
 * 新版本直接调用 `changeCurrentUserPassword`，
 * 旧版本回退为“先通过 token 获取当前用户，再调用 `changePassword(userId, ...)`”。
 *
 * @param token 当前会话令牌
 * @param oldPassword 原密码
 * @param newPassword 新密码
 * @returns 改密执行结果
 */
async function changePasswordByToken(token: string, oldPassword: string, newPassword: string) {
  const changeCurrentUserPassword = (iam.user as {
    changeCurrentUserPassword?: (accessToken: string, oldPassword: string, newPassword: string) => Promise<{
      success: boolean
      error: { message: string }
    }>
  }).changeCurrentUserPassword

  if (changeCurrentUserPassword) {
    return changeCurrentUserPassword(token, oldPassword, newPassword)
  }

  const currentUserResult = await iam.user.getCurrentUser(token)
  if (!currentUserResult.success) {
    return {
      success: false as const,
      error: { message: currentUserResult.error.message },
    }
  }

  return iam.user.changePassword(currentUserResult.data.id, oldPassword, newPassword)
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
