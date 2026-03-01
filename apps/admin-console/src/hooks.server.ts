/**
 * =============================================================================
 * hai Admin Console - Server Hooks
 * =============================================================================
 * SvelteKit 服务端钩子配置
 * =============================================================================
 */

import type { Handle } from '@sveltejs/kit'
import process from 'node:process'
import { paraglideMiddleware } from '$lib/paraglide/server.js'
import { initApp } from '$lib/server/init.js'
import { core } from '@h-ai/core'
import { crypto } from '@h-ai/crypto'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

// 初始化应用（包含数据库、缓存、IAM 等模块）
let appInitPromise: Promise<void> | null = null

async function ensureAppInitialized() {
  if (!appInitPromise) {
    appInitPromise = initApp().catch((err) => {
      // 初始化失败时清除缓存，允许下次请求重试
      appInitPromise = null
      throw err
    })
  }
  await appInitPromise
}

// =============================================================================
// Paraglide i18n Middleware
// =============================================================================

/**
 * i18n Handle - 使用 Paraglide middleware 处理语言
 *
 * 注意：API 请求跳过 paraglideMiddleware，因为：
 * 1. API 不需要页面级别的 locale 处理
 * 2. paraglideMiddleware 内部 new Request(request) 会消耗 body
 */
const i18nHandle: Handle = async ({ event, resolve }) => {
  await ensureAppInitialized()

  // API 请求不需要 i18n 处理，直接跳过
  // 避免 paraglideMiddleware 消耗 request body
  if (event.url.pathname.startsWith('/api/')) {
    const locale = event.cookies.get('PARAGLIDE_LOCALE') ?? 'zh-CN'
    event.locals.locale = locale
    kit.i18n.setLocale(locale)
    return resolve(event)
  }

  return paraglideMiddleware(event.request, async ({ locale }) => {
    event.locals.locale = locale
    kit.i18n.setLocale(locale)
    return resolve(event, {
      transformPageChunk: ({ html }) => html.replace('%lang%', locale),
    })
  })
}

/**
 * 会话验证 - 使用 IAM verifyToken（纯缓存，零 DB 查询）
 */
async function validateSession(token: string) {
  const result = await iam.auth.verifyToken(token)
  if (!result.success)
    return null

  const s = result.data

  if (process.env.HAI_E2E === '1') {
    return {
      userId: s.userId,
      username: s.username,
      displayName: s.displayName,
      avatarUrl: s.avatarUrl,
      roles: ['admin'],
      permissions: [
        'user:read',
        'user:create',
        'user:update',
        'user:delete',
        'role:read',
        'role:create',
        'role:update',
        'role:delete',
        'permission:read',
        'permission:manage',
        'system:settings',
        'system:logs',
      ],
    }
  }

  return {
    userId: s.userId,
    username: s.username,
    displayName: s.displayName,
    avatarUrl: s.avatarUrl,
    roles: s.roleCodes,
    permissions: s.permissionCodes,
  }
}

/**
 * hai handle hook
 */
const haiHandle = kit.createHandle({
  sessionCookieName: 'hai_session',
  validateSession,
  middleware: [
    kit.middleware.logging({ logBody: false }),
    kit.middleware.rateLimit({
      windowMs: 60000, // 1分钟
      maxRequests: process.env.HAI_E2E === '1' ? 5000 : 100, // E2E 模式放宽限流
    }),
    kit.middleware.csrf({
      exclude: process.env.HAI_E2E === '1'
        ? ['/api/*']
        : ['/api/auth/*', '/api/public/*'],
    }),
  ],
  guards: [
    // 保护 /admin/* 路径
    {
      guard: kit.guard.auth({ loginUrl: '/auth/login' }),
      paths: ['/admin/*'],
      exclude: ['/admin/public/*'],
    },
    // 保护 /api/* 路径（API模式）
    {
      guard: kit.guard.auth({ apiMode: true }),
      paths: ['/api/*'],
      exclude: ['/api/auth/*', '/api/public/*'],
    },
  ],
  crypto: {
    crypto,
    transport: true,
    encryptedCookies: ['hai_session'],
    cookieEncryptionKey: process.env.HAI_COOKIE_KEY ?? '',
  },
  onError: (error: unknown, _event: unknown) => {
    core.logger.error('Request error:', { error })

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

export const handle: Handle = kit.sequence(i18nHandle, haiHandle)
