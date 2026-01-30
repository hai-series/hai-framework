/**
 * =============================================================================
 * Admin Console - 用户管理 API
 * =============================================================================
 */

import type { RequestHandler } from '@sveltejs/kit'
import { audit } from '$lib/server/services/index.js'
import { iam } from '@hai/iam'
import { json } from '@sveltejs/kit'

/**
 * GET /api/iam/users - 获取用户列表
 *
 * TODO: 需要在 @hai/iam 中添加用户列表查询功能
 * 暂时返回空数组
 */
export const GET: RequestHandler = async () => {
  try {
    // iam 模块目前没有列表查询功能，返回空数据
    return json({
      success: true,
      data: {
        users: [],
        total: 0,
      },
    })
  }
  catch (error) {
    console.error('获取用户列表失败:', error)
    return json({ success: false, error: '获取用户列表失败' }, { status: 500 })
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
    console.error('创建用户失败:', error)
    return json({ success: false, error: '创建用户失败' }, { status: 500 })
  }
}
