/**
 * =============================================================================
 * hai Admin Console - Server Hooks
 * =============================================================================
 * SvelteKit 服务端钩子配置
 * =============================================================================
 */

import type { Handle } from '@sveltejs/kit'
import { initApp } from '$lib/server/init.js'
import { iam } from '@hai/iam'
import { authGuard, createHandle, loggingMiddleware, rateLimitMiddleware, sequence } from '@hai/kit'

// 初始化应用（包含数据库、缓存、IAM 等模块）
initApp()

/**
 * 会话验证 - 使用 IAM 模块验证 JWT token
 */
async function validateSession(token: string) {
  try {
    // 验证 token
    const verifyResult = await iam.auth.verifyToken(token)
    if (!verifyResult.success) {
      return null
    }

    const userId = verifyResult.data.sub

    // 获取用户信息
    const userResult = await iam.user.getUser(userId)
    if (!userResult.success || !userResult.data || !userResult.data.enabled) {
      return null
    }

    const user = userResult.data

    // 获取用户角色
    const rolesResult = await iam.authz.getUserRoles(userId)
    const roles = rolesResult.success ? rolesResult.data.map(r => r.code) : []

    // 获取用户权限
    const permissionsResult = await iam.authz.getUserPermissions(userId)
    const permissions = permissionsResult.success ? permissionsResult.data.map(p => p.code) : []

    return {
      userId: user.id,
      username: user.username,
      roles,
      permissions,
    }
  }
  catch (error) {
    console.error('会话验证失败:', error)
    return null
  }
}

/**
 * hai handle hook
 */
const haiHandle = createHandle({
  sessionCookieName: 'session_token',
  validateSession,
  logging: true,
  middleware: [
    loggingMiddleware({ logBody: false }),
    rateLimitMiddleware({
      windowMs: 60000, // 1分钟
      maxRequests: 100, // 最多100请求
    }),
  ],
  guards: [
    // 保护 /admin/* 路径
    {
      guard: authGuard({ loginUrl: '/auth/login' }),
      paths: ['/admin/*'],
      exclude: ['/admin/public/*'],
    },
    // 保护 /api/* 路径（API模式）
    {
      guard: authGuard({ apiMode: true }),
      paths: ['/api/*'],
      exclude: ['/api/auth/*', '/api/public/*'],
    },
  ],
  onError: (error: unknown, _event: unknown) => {
    console.error('Request error:', error)

    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  },
})

export const handle: Handle = sequence(haiHandle)
