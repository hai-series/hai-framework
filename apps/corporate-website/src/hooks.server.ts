/**
 * =============================================================================
 * hai Corporate Website - Server Hooks
 * =============================================================================
 */

import type { Handle } from '@sveltejs/kit'
import { paraglideMiddleware } from '$lib/paraglide/server.js'
import { initApp } from '$lib/server/init.js'
import { getPartnerAdminSessionByToken } from '$lib/server/partner-service.js'
import { kit } from '@h-ai/kit'

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
// 初始化 + i18n Handle
// =============================================================================

const i18nHandle: Handle = async ({ event, resolve }) => {
  await ensureAppInitialized()

  if (event.url.pathname.startsWith('/api/')) {
    const locale = event.cookies.get('PARAGLIDE_LOCALE') ?? 'zh-CN'
    event.locals.locale = locale
    kit.i18n.setLocale(locale)
    return resolve(event)
  }

  return paraglideMiddleware(event.request, async ({ locale }: { locale: string }) => {
    event.locals.locale = locale
    kit.i18n.setLocale(locale)

    return resolve(event, {
      transformPageChunk: ({ html }) => html.replace('%lang%', locale),
    })
  })
}

// =============================================================================
// 会话验证
// =============================================================================

async function validateSession(token: string) {
  const session = await getPartnerAdminSessionByToken(token)
  if (!session) {
    return null
  }

  return {
    userId: session.userId,
    username: session.username,
    roles: [session.role],
    permissions: ['partner:records:read'],
  }
}

// =============================================================================
// hai Handle
// =============================================================================

const haiHandle = kit.createHandle({
  auth: {
    verifyToken: validateSession,
    cookieName: 'corp_partner_access_token',
    loginUrl: '/partners/admin/login',
    protectedPaths: ['/partners/admin', '/partners/admin/*', '/api/partners/admin/*'],
    publicPaths: ['/partners/admin/login', '/api/partners/admin/login'],
  },
  rateLimit: { windowMs: 60000, maxRequests: 120 },
})

export const handle: Handle = kit.sequence(i18nHandle, haiHandle)
