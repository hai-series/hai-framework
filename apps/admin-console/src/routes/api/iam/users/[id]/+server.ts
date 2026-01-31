/**
 * =============================================================================
 * Admin Console - 单个用户管理 API
 * =============================================================================
 */

import type { RequestHandler } from '@sveltejs/kit'
import { audit } from '$lib/server/services/index.js'
import { iam } from '@hai/iam'
import { json } from '@sveltejs/kit'
import { core } from '@hai/core'

/**
 * GET /api/iam/users/[id] - 获取单个用户
 */
export const GET: RequestHandler = async ({ params }) => {
  try {
    const userResult = await iam.user.getUser(params.id!)
    if (!userResult.success || !userResult.data) {
      return json({ success: false, error: '用户不存在' }, { status: 404 })
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
    core.logger.error('获取用户失败:', { error })
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
    const { username, email, password, display_name, roles } = body as {
      username?: string
      email?: string
      password?: string
      display_name?: string
      status?: string
      roles?: string[]
    }

    // 检查用户是否存在
    const existingResult = await iam.user.getUser(userId)
    if (!existingResult.success || !existingResult.data) {
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

    // 更新密码（如果提供）
    if (password) {
      if (password.length < 8) {
        return json({ success: false, error: '密码至少需要8位' }, { status: 400 })
      }
      // 注意：这里暂时没有管理员直接重置用户密码的功能
      // 可以考虑添加 iam.user.adminResetPassword 方法
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
      return json({ success: false, error: '获取更新后的用户失败' }, { status: 500 })
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
    core.logger.error('更新用户失败:', { error })
    return json({ success: false, error: '更新用户失败' }, { status: 500 })
  }
}

/**
 * DELETE /api/iam/users/[id] - 删除用户
 *
 * TODO: 需要在 @hai/iam 中添加删除用户功能
 * 暂时返回错误
 */
export const DELETE: RequestHandler = async ({ params, locals, request, getClientAddress }) => {
  try {
    const userId = params.id!

    // 检查用户是否存在
    const existingResult = await iam.user.getUser(userId)
    if (!existingResult.success || !existingResult.data) {
      return json({ success: false, error: '用户不存在' }, { status: 404 })
    }

    const existing = existingResult.data

    // 禁止删除自己
    if (locals.session?.userId === userId) {
      return json({ success: false, error: '不能删除当前登录用户' }, { status: 400 })
    }

    // TODO: iam 模块目前没有删除用户功能
    // 暂时通过禁用用户来实现
    await iam.user.updateUser(userId, { enabled: false })

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
    core.logger.error('删除用户失败:', { error })
    return json({ success: false, error: '删除用户失败' }, { status: 500 })
  }
}
