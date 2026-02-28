/**
 * =============================================================================
 * Admin Console - 单个用户管理 API
 * =============================================================================
 */

import * as m from '$lib/paraglide/messages.js'
import { createUpdateUserSchema, IdParamSchema } from '$lib/server/schemas/index.js'
import { audit } from '$lib/server/services/index.js'
import { core } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

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
export const GET = kit.handler(async ({ params, locals }) => {
  kit.guard.requirePermission(locals.session, 'user:read')

  const { id } = kit.validate.paramsOrFail(params, IdParamSchema)

  const userResult = await iam.user.getUser(id)
  if (!userResult.success || !userResult.data) {
    return kit.response.notFound(m.api_iam_users_not_found())
  }

  const user = userResult.data

  // 获取用户角色
  const rolesResult = await iam.authz.getUserRoles(user.id)
  const roles = rolesResult.success ? rolesResult.data.map(r => r.code) : []

  return kit.response.ok({
    id: user.id,
    username: user.username,
    email: user.email,
    display_name: user.displayName,
    avatar: user.avatarUrl,
    status: user.enabled ? 'active' : 'inactive',
    roles,
    created_at: user.createdAt,
    updated_at: user.updatedAt,
  })
})

/**
 * PUT /api/iam/users/[id] - 更新用户
 *
 * 需要权限：user:update
 */
export const PUT = kit.handler(async ({ params, request, locals, getClientAddress }) => {
  kit.guard.requirePermission(locals.session, 'user:update')

  const { id: userId } = kit.validate.paramsOrFail(params, IdParamSchema)
  const { username, email, password, display_name, roles } = await kit.validate.formOrFail(request, createUpdateUserSchema())

  // 检查用户是否存在
  const existingResult = await iam.user.getUser(userId)
  if (!existingResult.success || !existingResult.data) {
    return kit.response.notFound(m.api_iam_users_not_found())
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
      return kit.response.badRequest(normalizeUpdateUserError(updateResult.error.message))
    }
  }

  // 更新密码（如果提供，管理员直接重置）
  if (password) {
    const resetResult = await iam.user.adminResetPassword(userId, password)
    if (!resetResult.success) {
      return kit.response.badRequest(resetResult.error.message)
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
    return kit.response.internalError(m.api_iam_users_get_updated_failed())
  }

  const user = updatedResult.data
  const rolesResult = await iam.authz.getUserRoles(userId)
  const userRoles = rolesResult.success ? rolesResult.data.map(r => r.code) : []

  return kit.response.ok({
    id: user.id,
    username: user.username,
    email: user.email,
    display_name: user.displayName,
    avatar: user.avatarUrl,
    status: user.enabled ? 'active' : 'inactive',
    roles: userRoles,
    created_at: user.createdAt,
    updated_at: user.updatedAt,
  })
})

/**
 * DELETE /api/iam/users/[id] - 删除用户
 *
 * 需要权限：user:delete
 */
export const DELETE = kit.handler(async ({ params, locals, request, cookies, getClientAddress }) => {
  kit.guard.requirePermission(locals.session, 'user:delete')

  const { id: userId } = kit.validate.paramsOrFail(params, IdParamSchema)

  // 检查用户是否存在
  const existingResult = await iam.user.getUser(userId)
  if (!existingResult.success || !existingResult.data) {
    return kit.response.notFound(m.api_iam_users_not_found())
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
    return kit.response.badRequest(m.api_iam_users_cannot_delete_self())
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
    return kit.response.internalError(m.api_iam_users_delete_failed())
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

  return kit.response.ok(null)
})
