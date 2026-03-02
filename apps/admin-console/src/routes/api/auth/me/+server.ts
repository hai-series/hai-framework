/**
 * =============================================================================
 * Admin Console - 认证 API: 获取当前用户
 * =============================================================================
 *
 * 与 /api/auth/profile GET 返回相同数据结构。
 * 保留此端点为兼容旧测试与外部调用；内部逻辑委托给共享辅助函数。
 * =============================================================================
 */

import { toIamUserResponse } from '$lib/server/iam-helpers.js'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

export const GET = kit.handler(async ({ cookies }) => {
  const token = cookies.get('hai_session')

  if (!token) {
    return kit.response.unauthorized()
  }

  // 验证令牌获取用户
  const userResult = await iam.user.getCurrentUser(token)
  if (!userResult.success) {
    kit.session.clearCookie(cookies)
    return kit.response.unauthorized()
  }

  const user = await toIamUserResponse(userResult.data)

  return kit.response.ok({ user })
})
