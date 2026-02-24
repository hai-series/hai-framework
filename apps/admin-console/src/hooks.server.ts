/**
 * =============================================================================
 * hai Admin Console - Server Hooks
 * =============================================================================
 * SvelteKit 服务端钩子配置
 * =============================================================================
 */

import type { Handle } from '@sveltejs/kit'
import { initApp } from '$lib/server/init.js'
import { core } from '@hai/core'
import { iam } from '@hai/iam'
import { authGuard, createHandle, loggingMiddleware, rateLimitMiddleware, sequence, setAllModulesLocale } from '@hai/kit'

// 初始化应用（包含数据库、缓存、IAM 等模块）
initApp()

// =============================================================================
// Paraglide i18n Middleware
// =============================================================================

// NOTE: paraglideMiddleware 会在 Paraglide 首次编译后自动生成
// 在 src/lib/paraglide/server.js 中
// 首次运行前请先执行 pnpm paraglide:compile 或 pnpm build

let paraglideMiddleware: ((request: Request, callback: (args: { request: Request, locale: string }) => Response | Promise<Response>) => Response | Promise<Response>) | null = null
let paraglideMiddlewarePromise: Promise<((request: Request, callback: (args: { request: Request, locale: string }) => Response | Promise<Response>) => Response | Promise<Response>) | null> | null = null

async function loadParaglideMiddleware() {
  if (paraglideMiddleware)
    return paraglideMiddleware

  if (!paraglideMiddlewarePromise) {
    paraglideMiddlewarePromise = import('$lib/paraglide/server.js')
      .then((paraglideServer) => {
        paraglideMiddleware = paraglideServer.paraglideMiddleware
        return paraglideMiddleware
      })
      .catch(() => {
        // Paraglide 尚未编译，跳过
        core.logger.warn('[i18n] Paraglide 尚未编译，跳过 i18n middleware')
        return null
      })
  }

  return paraglideMiddlewarePromise
}

/**
 * i18n Handle - 使用 Paraglide middleware 处理语言
 *
 * 注意：API 请求跳过 paraglideMiddleware，因为：
 * 1. API 不需要页面级别的 locale 处理
 * 2. paraglideMiddleware 内部 new Request(request) 会消耗 body
 */
const i18nHandle: Handle = async ({ event, resolve }) => {
  // API 请求不需要 i18n 处理，直接跳过
  // 避免 paraglideMiddleware 消耗 request body
  if (event.url.pathname.startsWith('/api/')) {
    const locale = event.cookies.get('PARAGLIDE_LOCALE') ?? 'zh-CN'
    event.locals.locale = locale
    setAllModulesLocale(locale)
    return resolve(event)
  }

  const middleware = await loadParaglideMiddleware()
  if (middleware) {
    return middleware(event.request, async ({ locale }) => {
      event.locals.locale = locale
      setAllModulesLocale(locale)
      return resolve(event, {
        transformPageChunk: ({ html }) => html.replace('%lang%', locale),
      })
    })
  }

  // Paraglide 未就绪时，使用默认语言
  event.locals.locale = 'zh-CN'
  setAllModulesLocale('zh-CN')
  return resolve(event, {
    transformPageChunk: ({ html }) => html.replace('%lang%', 'zh-CN'),
  })
}

/**
 * 会话验证 - 使用 IAM 模块验证 session token
 */
async function validateSession(token: string) {
  try {
    // 使用 session token 获取当前用户
    const userResult = await iam.user.getCurrentUser(token)
    if (!userResult.success || !userResult.data || !userResult.data.enabled) {
      return null
    }

    const user = userResult.data

    // 获取用户角色
    const rolesResult = await iam.authz.getUserRoles(user.id)
    const roles = rolesResult.success ? rolesResult.data.map(r => r.code) : []

    // 获取用户权限
    const permissionsResult = await iam.authz.getUserPermissions(user.id)
    const permissions = permissionsResult.success ? permissionsResult.data.map(p => p.code) : []

    return {
      userId: user.id,
      username: user.username,
      roles,
      permissions,
    }
  }
  catch (error) {
    core.logger.error('会话验证失败:', { error })
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

export const handle: Handle = sequence(i18nHandle, haiHandle)
