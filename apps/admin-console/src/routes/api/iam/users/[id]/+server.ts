/**
 * =============================================================================
 * Admin Console - 单个用户管理 API
 * =============================================================================
 */

import type { RequestHandler } from '@sveltejs/kit'
import { audit, userService } from '$lib/server/services/index.js'
import { json } from '@sveltejs/kit'

/**
 * GET /api/iam/users/[id] - 获取单个用户
 */
export const GET: RequestHandler = async ({ params }) => {
  try {
    const user = await userService.getById(params.id!)
    if (!user) {
      return json({ success: false, error: '用户不存在' }, { status: 404 })
    }
    return json({ success: true, data: user })
  }
  catch (error) {
    console.error('获取用户失败:', error)
    return json({ success: false, error: '获取用户失败' }, { status: 500 })
  }
}

/**
 * PUT /api/iam/users/[id] - 更新用户
 */
export const PUT: RequestHandler = async ({ params, request, locals, getClientAddress }) => {
  try {
    const userId = params.id!
    const body = await request.json()
    const { username, email, password, display_name, status, roles } = body as {
      username?: string
      email?: string
      password?: string
      display_name?: string
      status?: string
      roles?: string[]
    }

    // 检查用户是否存在
    const existing = await userService.getById(userId)
    if (!existing) {
      return json({ success: false, error: '用户不存在' }, { status: 404 })
    }

    // 验证用户名格式（如果提供）
    if (username && !/^\w{3,20}$/.test(username)) {
      return json({ success: false, error: '用户名需为3-20位字母、数字或下划线' }, { status: 400 })
    }

    // 验证邮箱格式（如果提供）
    if (email && !/^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/.test(email)) {
      return json({ success: false, error: '请输入有效的邮箱地址' }, { status: 400 })
    }

    // 检查用户名是否已被其他用户使用
    if (username && username !== existing.username) {
      const existingByUsername = await userService.getByIdentifier(username)
      if (existingByUsername && existingByUsername.id !== userId) {
        return json({ success: false, error: '用户名已被使用' }, { status: 409 })
      }
    }

    // 检查邮箱是否已被其他用户使用
    if (email && email !== existing.email) {
      const existingByEmail = await userService.getByIdentifier(email)
      if (existingByEmail && existingByEmail.id !== userId) {
        return json({ success: false, error: '邮箱已被注册' }, { status: 409 })
      }
    }

    // 更新用户
    await userService.update(userId, {
      username,
      email,
      display_name,
      status: status as 'active' | 'inactive' | 'banned' | undefined,
    })

    // 更新密码（如果提供）
    if (password) {
      if (password.length < 8) {
        return json({ success: false, error: '密码至少需要8位' }, { status: 400 })
      }
      await userService.resetPassword(userId, password)
    }

    // 更新角色（如果提供）
    if (roles !== undefined) {
      await userService.assignRoles(userId, roles)
    }

    // 记录审计日志
    const ip = getClientAddress()
    const ua = request.headers.get('user-agent') ?? undefined
    await audit.crud(
      locals.session?.userId ?? null,
      'update',
      'user',
      userId,
      { username, email, status },
      ip,
      ua,
    )

    const updatedUser = await userService.getById(userId)
    return json({ success: true, data: updatedUser })
  }
  catch (error) {
    console.error('更新用户失败:', error)
    return json({ success: false, error: '更新用户失败' }, { status: 500 })
  }
}

/**
 * DELETE /api/iam/users/[id] - 删除用户
 */
export const DELETE: RequestHandler = async ({ params, locals, request, getClientAddress }) => {
  try {
    const userId = params.id!

    // 检查用户是否存在
    const existing = await userService.getById(userId)
    if (!existing) {
      return json({ success: false, error: '用户不存在' }, { status: 404 })
    }

    // 禁止删除自己
    if (locals.session?.userId === userId) {
      return json({ success: false, error: '不能删除当前登录用户' }, { status: 400 })
    }

    // 删除用户
    await userService.delete(userId)

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
    console.error('删除用户失败:', error)
    return json({ success: false, error: '删除用户失败' }, { status: 500 })
  }
}
