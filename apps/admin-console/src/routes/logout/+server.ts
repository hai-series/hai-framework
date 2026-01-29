/**
 * =============================================================================
 * hai Admin Console - 退出登录
 * =============================================================================
 */

import type { RequestHandler } from './$types'
import { redirect } from '@sveltejs/kit'

export const GET: RequestHandler = async ({ cookies }) => {
  // 删除会话 Cookie
  cookies.delete('hai_session', { path: '/' })

  // 重定向到首页
  redirect(302, '/')
}
