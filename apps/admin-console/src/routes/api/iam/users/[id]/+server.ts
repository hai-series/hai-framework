/**
 * =============================================================================
 * Admin Console - 单个用户管理 API
 * =============================================================================
 */

import * as m from '$lib/paraglide/messages.js'
import { normalizeUniqueConstraintError, toIamUserResponse } from '$lib/server/iam-helpers.js'
import { createUpdateUserSchema, IdParamSchema } from '$lib/server/schemas/index.js'
import { audit } from '@h-ai/audit'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

/**
 * GET /api/iam/users/[id] - 获取单个用户
 *
 * 需要权限：user:list
 */
export const GET = kit.handler(async ({ params, locals }) => {
  kit.guard.require(locals.session, 'user:list')

  const { id } = kit.validate.params(params, IdParamSchema)

  const userResult = await iam.user.getUser(id)
  if (!userResult.success || !userResult.data) {
    return kit.response.notFound(m.api_iam_users_not_found())
  }

  return kit.response.ok(await toIamUserResponse(userResult.data))
})

/**
 * PUT /api/iam/users/[id] - 更新用户
 *
 * 需要权限：user:api:update
 */
export const PUT = kit.handler(async ({ params, request, locals, getClientAddress }) => {
  kit.guard.require(locals.session, 'user:api:update')

  const { id: userId } = kit.validate.params(params, IdParamSchema)
  const { username, email, password, display_name, roles, status } = await kit.validate.body(request, createUpdateUserSchema())

  // 检查用户是否存在
  const existingResult = await iam.user.getUser(userId)
  if (!existingResult.success || !existingResult.data) {
    return kit.response.notFound(m.api_iam_users_not_found())
  }

  // 更新用户信息（含启用/禁用状态）
  const updateData: Partial<{ username: string, email: string, displayName: string, enabled: boolean }> = {}
  if (username)
    updateData.username = username
  if (email)
    updateData.email = email
  if (display_name !== undefined)
    updateData.displayName = display_name
  if (status !== undefined)
    updateData.enabled = status === 'active'

  if (Object.keys(updateData).length > 0) {
    const updateResult = await iam.user.updateUser(userId, updateData)
    if (!updateResult.success) {
      return kit.response.badRequest(normalizeUniqueConstraintError(updateResult.error.message, m.api_iam_users_update_failed()))
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
    const syncResult = await iam.authz.syncRoles(userId, roles)
    if (!syncResult.success) {
      return kit.response.badRequest(syncResult.error.message)
    }
  }

  // 记录审计日志（包含密码重置标记）
  const ip = getClientAddress()
  const ua = request.headers.get('user-agent') ?? undefined
  await audit.helper.crud(
    locals.session!.userId,
    'update',
    'user',
    userId,
    { username, email, passwordReset: !!password },
    ip,
    ua,
  )

  // 获取更新后的用户信息
  const updatedResult = await iam.user.getUser(userId)
  if (!updatedResult.success || !updatedResult.data) {
    return kit.response.internalError(m.api_iam_users_get_updated_failed())
  }

  return kit.response.ok(await toIamUserResponse(updatedResult.data))
})

/**
 * DELETE /api/iam/users/[id] - 删除用户
 *
 * 需要权限：user:api:delete
 */
export const DELETE = kit.handler(async ({ params, locals, request, getClientAddress }) => {
  kit.guard.require(locals.session, 'user:api:delete')

  const { id: userId } = kit.validate.params(params, IdParamSchema)

  // 检查用户是否存在
  const existingResult = await iam.user.getUser(userId)
  if (!existingResult.success || !existingResult.data) {
    return kit.response.notFound(m.api_iam_users_not_found())
  }

  // 禁止删除自己（此路由受 auth guard 保护，session 必定存在）
  const currentUserId = locals.session!.userId

  if (currentUserId === userId) {
    return kit.response.badRequest(m.api_iam_users_cannot_delete_self())
  }

  const existing = existingResult.data

  // 使用 iam.user.deleteUser（内部清理角色关联、会话等数据）
  const deleteResult = await iam.user.deleteUser(userId)
  if (!deleteResult.success) {
    return kit.response.internalError(m.api_iam_users_delete_failed())
  }

  // 记录审计日志
  const ip = getClientAddress()
  const ua = request.headers.get('user-agent') ?? undefined
  await audit.helper.crud(
    locals.session!.userId,
    'delete',
    'user',
    userId,
    { username: existing.username },
    ip,
    ua,
  )

  return kit.response.ok(null)
})
