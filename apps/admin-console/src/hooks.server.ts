/**
 * =============================================================================
 * hai Admin Console - Server Hooks
 * =============================================================================
 * SvelteKit 服务端钩子配置
 * =============================================================================
 */

import { createHandle, authGuard, roleGuard, loggingMiddleware, rateLimitMiddleware, sequence } from '@hai/kit'
import type { Handle } from '@sveltejs/kit'

/**
 * 模拟会话验证（实际项目应从数据库/Redis获取）
 */
async function validateSession(token: string) {
    console.log('[validateSession] token:', token)
    // TODO: 实际项目中应验证 session token
    if (token === 'demo-session') {
        console.log('[validateSession] valid session')
        return {
            userId: 'user_001',
            username: 'admin',
            roles: ['admin'],
            permissions: ['*'],
        }
    }
    console.log('[validateSession] invalid session')
    return null
}

/**
 * hai handle hook
 */
const haiHandle = createHandle({
    sessionCookieName: 'hai_session',
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
            guard: authGuard({ loginUrl: '/login' }),
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
    onError: (error, event) => {
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
