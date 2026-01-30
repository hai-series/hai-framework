/**
 * =============================================================================
 * Admin Console - 首页重定向
 * =============================================================================
 */

import type { PageServerLoad } from './$types'
import { redirect } from '@sveltejs/kit'

export const load: PageServerLoad = async () => {
  // 重定向到管理后台
  throw redirect(302, '/admin')
}
