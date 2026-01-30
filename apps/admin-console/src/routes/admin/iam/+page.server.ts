/**
 * =============================================================================
 * Admin Console - IAM 入口重定向
 * =============================================================================
 */

import type { PageServerLoad } from './$types'
import { redirect } from '@sveltejs/kit'

export const load: PageServerLoad = async () => {
  // 重定向到用户管理
  throw redirect(302, '/admin/iam/users')
}
