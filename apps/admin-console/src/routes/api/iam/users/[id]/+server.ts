/**
 * =============================================================================
 * Admin Console - 单个用户管理 API
 * =============================================================================
 */

import type { RequestHandler } from '@sveltejs/kit'
import * as m from '$lib/paraglide/messages.js'
import { createUpdateUserSchema } from '$lib/server/schemas/index.js'
import { audit } from '$lib/server/services/index.js'
import { core } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'
import { json } from '@sveltejs/kit'

/**
 * 统一处理唯一键冲突错误，避免 API 响应泄露底层 SQL 细节。
 *
 * @param message 底层错误消息
 * @returns 用户可读错误提示
 */
function normalizeUpdateUserError(message: string | undefined): string {
  const lowerMessage = message?.toLowerCase() ?? ''
  if (lowerMessage.includes('unique constraint') || lowerMessage.includes('duplicate')) {
    return m.api_auth_username_or_email_taken()
  }
  return message ?? m.api_iam_users_update_failed()
}

/**
 * GET /api/iam/users/[id] - 获取单个用户
 *
 * 需要权限：user:read
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  const denied = kit.guard.assertPermission(locals.session, 'user:read')
  if (denied)
    return denied

  try {
    const userResult = await iam.user.getUser(params.id!)
    if (!userResult.success || !userResult.data) {
      return json({ success: false, error: m.api_iam_users_not_found() }, { status: 404 })
    }

    const user = userResult.data

    // 获取用户角色
    const rolesResult = await iam.authz.getUserRoles(user.id)
    const roles = rolesResult.success ? rolesResult.data.map(r => r.code) : []

    return json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        display_name: user.displayName,
        avatar: user.avatarUrl,
        status: user.enabled ? 'active' : 'inactive',
        roles,
        created_at: user.createdAt,
        updated_at: user.updatedAt,
      },
    })
  }
  catch (error) {
    core.logger.error('Failed to get user:', { error })
    return json({ success: false, error: m.api_iam_users_get_failed() }, { status: 500 })
  }
}

/**
 * PUT /api/iam/users/[id] - 更新用户
 *
 * 需要权限：user:update
 */
export const PUT: RequestHandler = async ({ params, request, locals, getClientAddress }) => {
  const denied = kit.guard.assertPermission(locals.session, 'user:update')
  if (denied)
    return denied

  try {
    const userId = params.id!
    const { valid, data, errors } = await kit.validate.form(request, createUpdateUserSchema())
    if (!valid) {
      return json({ success: false, error: errors[0]?.message }, { status: 400 })
    }
    const { username, email, password, display_name, roles } = data!

    // 检查用户是否存在
    const existingResult = await iam.user.getUser(userId)
    if (!existingResult.success || !existingResult.data) {
      return json({ success: false, error: m.api_iam_users_not_found() }, { status: 404 })
    }

    // 更新用户信息
    const updateData: Partial<{ username: string, email: string, displayName: string }> = {}
    if (username)
      updateData.username = username
    if (email)
      updateData.email = email
    if (display_name !== undefined)
      updateData.displayName = display_name

    if (Object.keys(updateData).length > 0) {
      const updateResult = await iam.user.updateUser(userId, updateData)
      if (!updateResult.success) {
        return json({ success: false, error: normalizeUpdateUserError(updateResult.error.message) }, { status: 400 })
      }
    }

    // 更新密码（如果提供，管理员直接重置）
    if (password) {
      const resetResult = await iam.user.adminResetPassword(userId, password)
      if (!resetResult.success) {
        return json({ success: false, error: resetResult.error.message }, { status: 400 })
      }
    }

    // 更新角色（如果提供）
    if (roles !== undefined) {
      // 先获取当前角色
      const currentRolesResult = await iam.authz.getUserRoles(userId)
      const currentRoles = currentRolesResult.success ? currentRolesResult.data.map(r => r.id) : []

      // 移除不在新列表中的角色
      for (const roleId of currentRoles) {
        if (!roles.includes(roleId)) {
          await iam.authz.removeRole(userId, roleId)
        }
      }

      // 添加新角色
      for (const roleId of roles) {
        if (!currentRoles.includes(roleId)) {
          await iam.authz.assignRole(userId, roleId)
        }
      }
    }

    // 记录审计日志
    const ip = getClientAddress()
    const ua = request.headers.get('user-agent') ?? undefined
    await audit.crud(
      locals.session?.userId ?? null,
      'update',
      'user',
      userId,
      { username, email },
      ip,
      ua,
    )

    // 获取更新后的用户信息
    const updatedResult = await iam.user.getUser(userId)
    if (!updatedResult.success || !updatedResult.data) {
      return json({ success: false, error: m.api_iam_users_get_updated_failed() }, { status: 500 })
    }

    const user = updatedResult.data
    const rolesResult = await iam.authz.getUserRoles(userId)
    const userRoles = rolesResult.success ? rolesResult.data.map(r => r.code) : []

    return json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        display_name: user.displayName,
        avatar: user.avatarUrl,
        status: user.enabled ? 'active' : 'inactive',
        roles: userRoles,
        created_at: user.createdAt,
        updated_at: user.updatedAt,
      },
    })
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (errorMessage.toLowerCase().includes('unique constraint') || errorMessage.toLowerCase().includes('duplicate')) {
      return json({ success: false, error: m.api_auth_username_or_email_taken() }, { status: 409 })
    }
    core.logger.error('Failed to update user:', { error })
    return json({ success: false, error: m.api_iam_users_update_failed() }, { status: 500 })
  }
}

/**
 * DELETE /api/iam/users/[id] - 删除用户
 *
 * 需要权限：user:delete
 */
export const DELETE: RequestHandler = async ({ params, locals, request, cookies, getClientAddress }) => {
  const denied = kit.guard.assertPermission(locals.session, 'user:delete')
  if (denied)
    return denied

  try {
    const userId = params.id!

    // 检查用户是否存在
    const existingResult = await iam.user.getUser(userId)
    if (!existingResult.success || !existingResult.data) {
      return json({ success: false, error: m.api_iam_users_not_found() }, { status: 404 })
    }

    // 禁止删除自己（优先使用 session，兜底使用 token 解析）
    let currentUserId = locals.session?.userId
    if (!currentUserId) {
      const token = cookies.get('session_token')
      if (token) {
        const currentUserResult = await iam.user.getCurrentUser(token)
        if (currentUserResult.success) {
          currentUserId = currentUserResult.data.id
        }
      }
    }

    if (currentUserId === userId) {
      return json({ success: false, error: m.api_iam_users_cannot_delete_self() }, { status: 400 })
    }

    const existing = existingResult.data

    // 尽力清理会话，但不应阻断用户删除主流程。
    try {
      await iam.session.deleteByUserId(userId)
    }
    catch (error) {
      core.logger.warn('Failed to clear user sessions before deletion', { userId, error })
    }

    // 使用 iam.user.deleteUser（内部清理角色关联等数据）
    const deleteResult = await iam.user.deleteUser(userId)
    if (!deleteResult.success) {
      core.logger.error('Failed to delete user', {
        userId,
        error: deleteResult.error.message,
      })
      return json({ success: false, error: m.api_iam_users_delete_failed() }, { status: 500 })
    }

    // 记录审计日志
    const ip = getClientAddress()
    const ua = request.headers.get('user-agent') ?? undefined
    await audit.crud(
      locals.session?.userId ?? null,
      'delete',
      'user',
      userId,
      { username: existing.username },
      ip,
      ua,
    )

    return json({ success: true })
  }
  catch (error) {
    core.logger.error('Failed to delete user', { error })
    return json({ success: false, error: m.api_iam_users_delete_failed() }, { status: 500 })
  }
}
