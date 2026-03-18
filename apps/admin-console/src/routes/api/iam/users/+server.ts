/**
 * =============================================================================
 * Admin Console - 用户管理 API
 * =============================================================================
 */

import * as m from '$lib/paraglide/messages.js'
import { toIamUserResponse } from '$lib/server/iam-helpers.js'
import { createCreateUserSchema, ListUsersQuerySchema } from '$lib/server/schemas/index.js'
import { audit } from '@h-ai/audit'
import { iam, IamErrorCode } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

/**
 * GET /api/iam/users - 获取用户列表
 *
 * 需要权限：user:list
 *
 * 支持分页、搜索关键字和启用状态过滤。
 *
 * 查询参数：
 * - page: 页码（默认 1）
 * - pageSize: 每页数量（默认 20）
 * - search: 搜索关键字（模糊匹配用户名/邮箱）
 * - enabled: 启用状态过滤（true/false，不传则返回全部）
 */
export const GET = kit.handler(async ({ url, locals }) => {
  kit.guard.require(locals.session, 'user:list')

  const { page, pageSize, search, enabled } = kit.validate.query(url, ListUsersQuerySchema)

  const usersResult = await iam.user.listUsers({ page, pageSize, search, enabled, include: ['roles'] })
  if (!usersResult.success) {
    return kit.response.internalError(usersResult.error.message)
  }

  const { items, total } = usersResult.data

  // 角色已随 listUsers 返回，直接映射为前端格式
  const users = items.map(user => ({
    id: user.id,
    username: user.username,
    email: user.email,
    display_name: user.displayName,
    avatar: user.avatarUrl,
    status: user.enabled !== false ? 'active' as const : 'inactive' as const,
    roles: (user.roles ?? []).map(r => r.code),
    created_at: user.createdAt,
    updated_at: user.updatedAt,
  }))

  return kit.response.ok({ users, total, page, pageSize })
})

/**
 * POST /api/iam/users - 创建用户
 *
 * 需要权限：user:api:create
 */
export const POST = kit.handler(async ({ request, locals, getClientAddress }) => {
  kit.guard.require(locals.session, 'user:api:create')

  const { username, email, password, roles, status } = await kit.validate.body(request, createCreateUserSchema())

  // 使用 IAM 模块注册用户
  const registerResult = await iam.user.register({
    username,
    email,
    password,
  })

  if (!registerResult.success) {
    if (registerResult.error.code === IamErrorCode.USER_NOT_FOUND || registerResult.error.code === IamErrorCode.USER_ALREADY_EXISTS) {
      return kit.response.conflict(m.api_auth_username_or_email_taken())
    }
    return kit.response.badRequest(registerResult.error.message)
  }

  const { user } = registerResult.data

  // 如果管理员创建时指定了非 active 状态，需要禁用用户
  if (status && status !== 'active') {
    await iam.user.updateUser(user.id, { enabled: false })
  }

  // 分配角色（iam.user.register 已分配 config.rbac.defaultRole）
  // 管理员创建时额外分配指定角色
  if (roles?.length) {
    await iam.authz.syncRoles(user.id, roles)
  }

  // 审计日志 + 用户信息并行获取
  const ip = getClientAddress()
  const ua = request.headers.get('user-agent') ?? undefined
  const [, userResponse] = await Promise.all([
    audit.helper.crud({
      userId: locals.session!.userId,
      action: 'create',
      resource: 'user',
      resourceId: user.id,
      details: { username, email },
      ip,
      ua,
    }),
    toIamUserResponse(user),
  ])

  return kit.response.ok(userResponse)
})
