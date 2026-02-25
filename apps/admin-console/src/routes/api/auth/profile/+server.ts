import type { RequestHandler } from '@sveltejs/kit'
import * as m from '$lib/paraglide/messages.js'
import { UpdateProfileSchema } from '$lib/server/schemas/index.js'
import { core } from '@hai/core'
import { iam } from '@hai/iam'
import { kit } from '@hai/kit'
import { json } from '@sveltejs/kit'

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
      return json({ success: false, error: m.common_error() }, { status: 401 })
    }

    const userResult = await iam.user.getCurrentUser(token)
    if (!userResult.success) {
      return json({ success: false, error: m.common_error() }, { status: 401 })
    }

    const rolesResult = await iam.authz.getUserRoles(userResult.data.id)
    const roles = rolesResult.success ? rolesResult.data.map(r => r.code) : []

    return json({
      success: true,
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
    return json({ success: false, error: m.common_error() }, { status: 500 })
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
      return json({ success: false, error: m.common_error() }, { status: 401 })
    }

    const { valid, data, errors } = await kit.validate.form(request, UpdateProfileSchema)
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
      return json({
        success: false,
        error: normalizedError,
        fieldErrors: { general: normalizedError },
      }, { status: 400 })
    }

    const rolesResult = await iam.authz.getUserRoles(updateResult.data.id)
    const roles = rolesResult.success ? rolesResult.data.map(r => r.code) : []

    return json({
      success: true,
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
      return json({
        success: false,
        error: m.api_auth_username_or_email_taken(),
        fieldErrors: { general: m.api_auth_username_or_email_taken() },
      }, { status: 409 })
    }
    core.logger.error('Failed to update current profile', { error })
    return json({ success: false, error: m.common_error() }, { status: 500 })
  }
}
