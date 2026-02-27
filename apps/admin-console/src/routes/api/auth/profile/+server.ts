import type { RequestHandler } from '@sveltejs/kit'
import * as m from '$lib/paraglide/messages.js'
import { UpdateProfileSchema } from '$lib/server/schemas/index.js'
import { core } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

/**
 * 将底层唯一键冲突错误映射为稳定的用户可读提示。
 *
 * @param message 底层错误消息
 * @returns 用户可读错误提示
 */
function normalizeProfileUpdateError(message: string | undefined): string {
  const lowerMessage = message?.toLowerCase() ?? ''
  if (lowerMessage.includes('unique constraint') || lowerMessage.includes('duplicate')) {
    return m.api_auth_username_or_email_taken()
  }
  return message ?? m.common_error()
}

export const GET: RequestHandler = async ({ cookies }) => {
  try {
    const token = cookies.get('session_token')
    if (!token) {
      return kit.response.unauthorized(m.common_error())
    }

    const userResult = await iam.user.getCurrentUser(token)
    if (!userResult.success) {
      return kit.response.unauthorized(m.common_error())
    }

    const rolesResult = await iam.authz.getUserRoles(userResult.data.id)
    const roles = rolesResult.success ? rolesResult.data.map(r => r.code) : []

    return kit.response.ok({
      user: {
        id: userResult.data.id,
        username: userResult.data.username,
        email: userResult.data.email ?? '',
        display_name: userResult.data.displayName ?? '',
        phone: userResult.data.phone ?? '',
        avatar: userResult.data.avatarUrl ?? '',
        roles,
      },
    })
  }
  catch (error) {
    core.logger.error('Failed to get current profile', { error })
    return kit.response.internalError(m.common_error())
  }
}

/**
 * 根据当前会话令牌更新用户资料字段。
 *
 * @returns 更新结果，成功返回最新用户信息
 */
export const PUT: RequestHandler = async ({ cookies, request }) => {
  try {
    const token = cookies.get('session_token')
    if (!token) {
      return kit.response.unauthorized(m.common_error())
    }

    const { valid, data, errors } = await kit.validate.form(request, UpdateProfileSchema)
    if (!valid) {
      const fieldErrors = Object.fromEntries(
        errors.map(error => [error.field, error.message]),
      )
      return kit.response.badRequest(
        errors[0]?.message ?? m.common_error(),
        undefined,
        { fieldErrors },
      )
    }

    const patch: {
      username?: string
      displayName?: string
      email?: string
      phone?: string
      avatarUrl?: string
    } = {}

    const username = data?.username?.trim()
    const displayName = data?.display_name?.trim()
    const email = data?.email?.trim()
    const phone = data?.phone?.trim()
    const avatar = data?.avatar?.trim()

    if (username) {
      patch.username = username
    }
    if (displayName) {
      patch.displayName = displayName
    }
    if (email) {
      patch.email = email
    }
    if (phone) {
      patch.phone = phone
    }
    if (avatar) {
      patch.avatarUrl = avatar
    }

    const updateResult = await iam.user.updateCurrentUser(token, patch)
    if (!updateResult.success) {
      const normalizedError = normalizeProfileUpdateError(updateResult.error.message)
      return kit.response.badRequest(
        normalizedError,
        undefined,
        { fieldErrors: { general: normalizedError } },
      )
    }

    const rolesResult = await iam.authz.getUserRoles(updateResult.data.id)
    const roles = rolesResult.success ? rolesResult.data.map(r => r.code) : []

    return kit.response.ok({
      user: {
        id: updateResult.data.id,
        username: updateResult.data.username,
        email: updateResult.data.email ?? '',
        display_name: updateResult.data.displayName ?? '',
        phone: updateResult.data.phone ?? '',
        avatar: updateResult.data.avatarUrl ?? '',
        roles,
      },
    })
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (errorMessage.toLowerCase().includes('unique constraint') || errorMessage.toLowerCase().includes('duplicate')) {
      return kit.response.error('CONFLICT', m.api_auth_username_or_email_taken(), 409, undefined, { fieldErrors: { general: m.api_auth_username_or_email_taken() } })
    }
    core.logger.error('Failed to update current profile', { error })
    return kit.response.internalError(m.common_error())
  }
}
