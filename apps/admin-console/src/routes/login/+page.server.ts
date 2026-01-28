/**
 * =============================================================================
 * hai Admin Console - 登录页面服务端
 * =============================================================================
 */

import { fail, redirect } from '@sveltejs/kit'
import { z } from 'zod'
import type { Actions, PageServerLoad } from './$types'

/**
 * 登录表单 Schema
 */
const loginSchema = z.object({
    username: z.string().min(1, '请输入用户名'),
    password: z.string().min(1, '请输入密码'),
    rememberMe: z.string().optional().transform(v => v === 'on'),
})

/**
 * 页面加载
 */
export const load: PageServerLoad = async ({ locals }) => {
    // 已登录则跳转到后台
    if (locals.session) {
        redirect(302, '/admin')
    }

    return {}
}

/**
 * 表单处理
 */
export const actions: Actions = {
    default: async ({ request, cookies }) => {
        const formData = await request.formData()
        const data = Object.fromEntries(formData)

        // 验证表单
        const result = loginSchema.safeParse(data)

        if (!result.success) {
            const errors = result.error.flatten().fieldErrors
            return fail(400, {
                message: Object.values(errors).flat()[0] ?? '表单验证失败',
            })
        }

        const { username, password, rememberMe } = result.data

        // TODO: 实际项目中应验证用户名密码
        // 这里使用演示账号
        if (username !== 'admin' || password !== 'admin123') {
            return fail(401, {
                message: '用户名或密码错误',
            })
        }

        // 设置会话 Cookie
        const maxAge = rememberMe ? 7 * 24 * 60 * 60 : 24 * 60 * 60 // 7天或1天

        cookies.set('hai_session', 'demo-session', {
            path: '/',
            httpOnly: true,
            secure: false, // 生产环境应为 true
            sameSite: 'lax',
            maxAge,
        })

        // 重定向到后台
        redirect(302, '/admin')
    },
}
