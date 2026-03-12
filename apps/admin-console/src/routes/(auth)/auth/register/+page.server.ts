/**
 * =============================================================================
 * Admin Console - 注册页面服务端
 * =============================================================================
 * 当注册功能被禁用时，重定向到登录页
 * =============================================================================
 */

import type { PageServerLoad } from './$types'
import { iam } from '@h-ai/iam'
import { redirect } from '@sveltejs/kit'

export const load: PageServerLoad = async () => {
  if (!iam.isRegisterEnabled) {
    redirect(302, '/auth/login')
  }
}
