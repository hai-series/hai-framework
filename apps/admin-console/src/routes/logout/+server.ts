/**
 * =============================================================================
 * hai Admin Console - 退出登录
 * =============================================================================
 */

import { redirect } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ cookies }) => {
    // 删除会话 Cookie
    cookies.delete('hai_session', { path: '/' })

    // 重定向到首页
    redirect(302, '/')
}
