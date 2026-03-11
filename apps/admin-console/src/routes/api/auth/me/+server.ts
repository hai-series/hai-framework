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

export const GET = kit.handler(async ({ locals }) => {
  if (!locals.accessToken) {
    return kit.response.unauthorized()
  }

  const userResult = await iam.user.getCurrentUser(locals.accessToken)
  if (!userResult.success) {
    return kit.response.unauthorized()
  }

  const user = await toIamUserResponse(userResult.data)

  return kit.response.ok({ user })
})
