/**
 * =============================================================================
 * hai Admin Console - Server Hooks
 * =============================================================================
 * SvelteKit 服务端钩子配置
 * =============================================================================
 */

import type { Handle } from '@sveltejs/kit'
import { initDatabase } from '$lib/server/database.js'
import { sessionService, userService } from '$lib/server/services/index.js'
// @ts-expect-error @hai/kit 暂无类型定义
import { authGuard, createHandle, loggingMiddleware, rateLimitMiddleware, sequence } from '@hai/kit'

// 初始化数据库
initDatabase()

/**
 * 会话验证 - 从 SQLite 数据库验证 session token
 */
async function validateSession(token: string) {
  try {
    // 验证会话
    const session = await sessionService.validate(token)
    if (!session) {
      return null
    }

    // 获取用户信息
    const user = await userService.getById(session.userId)
    if (!user || user.status !== 'active') {
      return null
    }

    return {
      userId: user.id,
      username: user.username,
      roles: user.roles,
      permissions: ['*'], // TODO: 从角色权限中获取
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
