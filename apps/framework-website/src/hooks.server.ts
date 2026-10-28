/**
 * =============================================================================
 * framework-website - Server Hooks
 * =============================================================================
 */

import type { Handle } from '@sveltejs/kit'
import { paraglideMiddleware } from '$lib/paraglide/server.js'
import { initApp } from '$lib/server/init.js'
import { core } from '@h-ai/core'
import { kit } from '@h-ai/kit'

// =============================================================================
// 应用初始化
// =============================================================================

let appInitPromise: Promise<void> | null = null

async function ensureAppInitialized() {
  if (!appInitPromise) {
    appInitPromise = initApp().catch((err: unknown) => {
      appInitPromise = null
      throw err
    })
  }
  await appInitPromise
}

// =============================================================================
// 初始化 Handle
// =============================================================================

const initHandle: Handle = async ({ event, resolve }) => {
  await ensureAppInitialized()
  return resolve(event)
}

// =============================================================================
// Paraglide i18n Middleware
// =============================================================================

/**
 * i18n Handle - 使用 Paraglide middleware 处理语言
 *
 * API 请求跳过 paraglideMiddleware（不需要页面级 locale + 避免消耗 body）
 */
const i18nHandle: Handle = async ({ event, resolve }) => {
  if (event.url.pathname.startsWith('/api/')) {
    const locale = event.cookies.get('PARAGLIDE_LOCALE') ?? 'zh-CN'
    event.locals.locale = locale
    return kit.i18n.runWithLocale(locale, () => resolve(event))
  }

  return paraglideMiddleware(event.request, async ({ locale }) => {
    event.locals.locale = locale
    return kit.i18n.runWithLocale(locale, () => resolve(event, {
      transformPageChunk: ({ html }) => html.replace('%lang%', locale),
    }))
  })
}

// =============================================================================
// hai Handle（会话验证 + 限流 + 日志）
// =============================================================================

const haiHandle = kit.createHandle({
  // 未选择cache能力时不启用限流；启用前须接入共享原子store。
  rateLimit: false,
  logging: { logBody: false },
  onError: (error: unknown, _event) => {
    core.logger.error('Request error:', { error })
    return new Response(
      JSON.stringify({
        success: false,
        error: core.error.toPublic({ code: 'INTERNAL_ERROR', message: '', httpStatus: 500 }),
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  },
})

// =============================================================================
// 组合 Handle
// =============================================================================

export const handle = kit.sequence(
  initHandle,
  i18nHandle,
  haiHandle,
)
