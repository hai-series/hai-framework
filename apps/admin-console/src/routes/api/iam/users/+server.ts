/**
 * =============================================================================
 * Admin Console - 用户管理 API
 * =============================================================================
 */

import type { RequestHandler } from '@sveltejs/kit'
import { audit } from '$lib/server/services/index.js'
import { core } from '@hai/core'
import { iam } from '@hai/iam'
import { json } from '@sveltejs/kit'

/**
 * GET /api/iam/users - 获取用户列表
 *
 * 支持分页、搜索关键字和启用状态过滤。
 *
 * 查询参数：
 * - page: 页码（默认 1）
 * - pageSize: 每页数量（默认 20）
 * - search: 搜索关键字（模糊匹配用户名/邮箱）
 * - enabled: 启用状态过滤（true/false，不传则返回全部）
 */
export const GET: RequestHandler = async ({ url }) => {
  try {
    const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1)
    const pageSize = Math.max(1, Number.parseInt(url.searchParams.get('pageSize') ?? '20', 10) || 20)
    const search = url.searchParams.get('search') ?? undefined
    const enabledParam = url.searchParams.get('enabled')
    const enabled = enabledParam === 'true' ? true : enabledParam === 'false' ? false : undefined

    const usersResult = await iam.user.listUsers({ page, pageSize, search, enabled })
    if (!usersResult.success) {
      core.logger.error('Failed to list users', { error: usersResult.error })
      return json({ success: false, error: usersResult.error.message }, { status: 500 })
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

    return json({ success: true, data: { users, total, page, pageSize } })
  }
  catch (error) {
    core.logger.error('Failed to list users', { error })
    return json({ success: false, error: 'Failed to list users' }, { status: 500 })
  }
}

/**
 * POST /api/iam/users - 创建用户
 */
export const POST: RequestHandler = async ({ request, locals, getClientAddress }) => {
  try {
    const body = await request.json()
    const { username, email, password, roles } = body as {
      username: string
      email: string
      password: string
      display_name?: string
      status?: string
      roles?: string[]
    }

    // 验证必填字段
    if (!username || !email || !password) {
      return json({ success: false, error: '请填写所有必填字段' }, { status: 400 })
    }

    // 验证用户名格式
    if (!/^\w{3,20}$/.test(username)) {
      return json({ success: false, error: '用户名需为3-20位字母、数字或下划线' }, { status: 400 })
    }

    // 验证邮箱格式
    if (!/^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/.test(email)) {
      return json({ success: false, error: '请输入有效的邮箱地址' }, { status: 400 })
    }

    // 验证密码强度
    if (password.length < 8) {
      return json({ success: false, error: '密码至少需要8位' }, { status: 400 })
    }

    // 使用 IAM 模块注册用户
    const registerResult = await iam.user.register({
      username,
      email,
      password,
    })

    if (!registerResult.success) {
      if (registerResult.error.code === 5002 || registerResult.error.code === 5502) {
        return json({ success: false, error: '用户名或邮箱已被使用' }, { status: 409 })
      }
      return json({ success: false, error: registerResult.error.message }, { status: 400 })
    }

    const user = registerResult.data

    // 分配角色
    const rolesToAssign = roles?.length ? roles : ['role_user']
    for (const roleId of rolesToAssign) {
      await iam.authz.assignRole(user.id, roleId)
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
    core.logger.error('创建用户失败:', { error })
    return json({ success: false, error: '创建用户失败' }, { status: 500 })
  }
}
