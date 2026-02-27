/**
 * =============================================================================
 * Admin Console - 用户管理 API
 * =============================================================================
 */

import type { RequestHandler } from '@sveltejs/kit'
import * as m from '$lib/paraglide/messages.js'
import { createCreateUserSchema, ListUsersQuerySchema } from '$lib/server/schemas/index.js'
import { audit } from '$lib/server/services/index.js'
import { core } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

/**
 * GET /api/iam/users - 获取用户列表
 *
 * 需要权限：user:read
 *
 * 支持分页、搜索关键字和启用状态过滤。
 *
 * 查询参数：
 * - page: 页码（默认 1）
 * - pageSize: 每页数量（默认 20）
 * - search: 搜索关键字（模糊匹配用户名/邮箱）
 * - enabled: 启用状态过滤（true/false，不传则返回全部）
 */
export const GET: RequestHandler = async ({ url, locals }) => {
  const denied = kit.guard.assertPermission(locals.session, 'user:read')
  if (denied)
    return denied

  try {
    const { valid, data: query, errors } = kit.validate.query(url, ListUsersQuerySchema)
    if (!valid) {
      return kit.response.badRequest(errors[0]?.message ?? 'Validation failed')
    }
    const { page, pageSize, search, enabled } = query!

    const usersResult = await iam.user.listUsers({ page, pageSize, search, enabled })
    if (!usersResult.success) {
      core.logger.error('Failed to list users', { error: usersResult.error })
      return kit.response.internalError(usersResult.error.message)
    }

    const { items, total } = usersResult.data

    // 获取每个用户的角色
    const users = await Promise.all(
      items.map(async (user) => {
        const rolesResult = await iam.authz.getUserRoles(user.id)
        const roles = rolesResult.success ? rolesResult.data.map(r => r.code) : []
        return {
          id: user.id,
          username: user.username,
          email: user.email,
          display_name: user.displayName,
          avatar: user.avatarUrl,
          status: user.enabled ? 'active' : 'inactive',
          roles,
          created_at: user.createdAt,
          updated_at: user.updatedAt,
        }
      }),
    )

    return kit.response.ok({ users, total, page, pageSize })
  }
  catch (error) {
    core.logger.error('Failed to list users', { error })
    return kit.response.internalError(m.api_iam_users_list_failed())
  }
}

/**
 * POST /api/iam/users - 创建用户
 *
 * 需要权限：user:create
 */
export const POST: RequestHandler = async ({ request, locals, getClientAddress }) => {
  const denied = kit.guard.assertPermission(locals.session, 'user:create')
  if (denied)
    return denied

  try {
    const { valid, data, errors } = await kit.validate.form(request, createCreateUserSchema())
    if (!valid) {
      return kit.response.badRequest(errors[0]?.message ?? 'Validation failed')
    }
    const { username, email, password, roles } = data!

    // 使用 IAM 模块注册用户
    const registerResult = await iam.user.register({
      username,
      email,
      password,
    })

    if (!registerResult.success) {
      if (registerResult.error.code === 5002 || registerResult.error.code === 5502) {
        return kit.response.conflict(m.api_auth_username_or_email_taken())
      }
      return kit.response.badRequest(registerResult.error.message)
    }

    const { user } = registerResult.data

    // 分配角色（iam.user.register 已分配 config.rbac.defaultRole）
    // 管理员创建时额外分配指定角色
    if (roles?.length) {
      for (const roleId of roles) {
        await iam.authz.assignRole(user.id, roleId)
      }
    }

    // 记录审计日志
    const ip = getClientAddress()
    const ua = request.headers.get('user-agent') ?? undefined
    await audit.crud(
      locals.session?.userId ?? null,
      'create',
      'user',
      user.id,
      { username, email },
      ip,
      ua,
    )

    // 获取用户角色
    const rolesResult = await iam.authz.getUserRoles(user.id)
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
  }
  catch (error) {
    core.logger.error('Failed to create user:', { error })
    return kit.response.internalError(m.api_iam_users_create_failed())
  }
}
