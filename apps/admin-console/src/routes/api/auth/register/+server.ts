/**
 * =============================================================================
 * Admin Console - 认证 API: 注册
 * =============================================================================
 */

import type { RequestHandler } from '@sveltejs/kit'
import { audit, sessionService, userService } from '$lib/server/services/index.js'
import { json } from '@sveltejs/kit'

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
  try {
    const body = await request.json()
    const { username, email, password, confirmPassword } = body as {
      username: string
      email: string
      password: string
      confirmPassword: string
    }

    // 验证必填字段
    if (!username || !email || !password) {
      return json({ success: false, error: '请填写所有必填字段' }, { status: 400 })
    }

    // 验证密码确认
    if (password !== confirmPassword) {
      return json({ success: false, error: '两次输入的密码不一致' }, { status: 400 })
    }

    // 验证用户名格式（3-20位字母数字下划线）
    if (!/^\w{3,20}$/.test(username)) {
      return json({ success: false, error: '用户名需为3-20位字母、数字或下划线' }, { status: 400 })
    }

    // 验证邮箱格式
    if (!/^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/.test(email)) {
      return json({ success: false, error: '请输入有效的邮箱地址' }, { status: 400 })
    }

    // 验证密码强度（至少8位，包含字母和数字）
    if (password.length < 8 || !/[a-z]/i.test(password) || !/\d/.test(password)) {
      return json({ success: false, error: '密码需至少8位，包含字母和数字' }, { status: 400 })
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
      display_name: username,
    })

    // 分配默认角色 (user)
    await userService.assignRoles(user.id, ['user'])
    const userWithRoles = await userService.getById(user.id)

    // 创建会话
    const ip = getClientAddress()
    const ua = request.headers.get('user-agent') ?? undefined
    const token = await sessionService.create(user.id, ip, ua)

    // 设置 Cookie
    cookies.set('session_token', token, {
      path: '/',
      httpOnly: true,
      // eslint-disable-next-line node/prefer-global/process
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 天
    })

    // 记录审计日志
    await audit.register(user.id, ip, ua)

    return json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        display_name: userWithRoles?.display_name,
        avatar: userWithRoles?.avatar,
        roles: userWithRoles?.roles ?? [],
      },
    })
  }
  catch (error) {
    console.error('注册失败:', error)
    return json({ success: false, error: '注册失败，请稍后重试' }, { status: 500 })
  }
}
