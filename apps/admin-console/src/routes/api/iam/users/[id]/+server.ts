/**
 * =============================================================================
 * Admin Console - 单个用户管理 API
 * =============================================================================
 */

import type { RequestHandler } from '@sveltejs/kit'
import * as m from '$lib/paraglide/messages.js'
import { UpdateUserSchema } from '$lib/server/schemas/index.js'
import { audit } from '$lib/server/services/index.js'
import { core } from '@hai/core'
import { iam } from '@hai/iam'
import { validateForm } from '@hai/kit'
import { json } from '@sveltejs/kit'

/**
 * GET /api/iam/users/[id] - 获取单个用户
 */
export const GET: RequestHandler = async ({ params }) => {
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
 */
export const PUT: RequestHandler = async ({ params, request, locals, getClientAddress }) => {
  try {
    const userId = params.id!
    const { valid, data, errors } = await validateForm(request, UpdateUserSchema)
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
    if (display_name)
      updateData.displayName = display_name

    if (Object.keys(updateData).length > 0) {
      const updateResult = await iam.user.updateUser(userId, updateData)
      if (!updateResult.success) {
        return json({ success: false, error: updateResult.error.message }, { status: 400 })
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
    core.logger.error('Failed to update user:', { error })
    return json({ success: false, error: m.api_iam_users_update_failed() }, { status: 500 })
  }
}

/**
 * DELETE /api/iam/users/[id] - 删除用户
 */
export const DELETE: RequestHandler = async ({ params, locals, request, getClientAddress }) => {
  try {
    const userId = params.id!

    // 检查用户是否存在
    const existingResult = await iam.user.getUser(userId)
    if (!existingResult.success || !existingResult.data) {
      return json({ success: false, error: m.api_iam_users_not_found() }, { status: 404 })
    }

    // 禁止删除自己
    if (locals.session?.userId === userId) {
      return json({ success: false, error: m.api_iam_users_cannot_delete_self() }, { status: 400 })
    }

    const existing = existingResult.data

    const deleteResult = await iam.user.deleteUser(userId)
    if (!deleteResult.success) {
      return json({ success: false, error: deleteResult.error.message }, { status: 500 })
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
