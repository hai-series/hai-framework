/**
 * =============================================================================
 * Admin Console - 用户管理 API
 * =============================================================================
 */

import type { RequestHandler } from '@sveltejs/kit'
import { audit, userService } from '$lib/server/services/index.js'
import { json } from '@sveltejs/kit'

/**
 * GET /api/iam/users - 获取用户列表
 */
export const GET: RequestHandler = async () => {
  try {
    const users = await userService.list()
    return json({ success: true, data: users })
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
    const { username, email, password, display_name, status, roles } = body as {
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

    // 检查用户名是否已存在
    const existingByUsername = await userService.getByIdentifier(username)
    if (existingByUsername) {
      return json({ success: false, error: '用户名已被使用' }, { status: 409 })
    }

    // 检查邮箱是否已存在
    const existingByEmail = await userService.getByIdentifier(email)
    if (existingByEmail) {
      return json({ success: false, error: '邮箱已被注册' }, { status: 409 })
    }

    // 创建用户
    const user = await userService.create({
      username,
      email,
      password,
      display_name,
      roles,
    })

    // 如果指定了状态且不是默认的 active，更新状态
    if (status && status !== 'active') {
      await userService.update(user.id, { status: status as 'active' | 'inactive' | 'banned' })
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

    const userWithRoles = await userService.getById(user.id)
    return json({ success: true, data: userWithRoles })
  }
  catch (error) {
    console.error('创建用户失败:', error)
    return json({ success: false, error: '创建用户失败' }, { status: 500 })
  }
}
