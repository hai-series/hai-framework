/**
 * =============================================================================
 * hai Corporate Website - Server Hooks
 * =============================================================================
 */

import type { Handle } from '@sveltejs/kit'
import { paraglideMiddleware } from '$lib/paraglide/server.js'
import { initApp } from '$lib/server/init.js'
import { getPartnerAdminSessionByToken } from '$lib/server/partner-service.js'
import { core } from '@h-ai/core'
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
  validateSession,
  middleware: [
    kit.middleware.logging({ logBody: false }),
    kit.middleware.rateLimit({ windowMs: 60000, maxRequests: 120 }),
  ],
  guards: [
    {
      guard: async (event, session) => {
        if (session) {
          return { allowed: true }
        }

        const token = event.cookies.get('corp_partner_access_token')
        if (!token) {
          const returnUrl = encodeURIComponent(event.url.pathname + event.url.search)
          return { allowed: false, redirect: `/partners/admin/login?returnUrl=${returnUrl}` }
        }

        const recoveredSession = await validateSession(token)
        if (!recoveredSession) {
          const returnUrl = encodeURIComponent(event.url.pathname + event.url.search)
          return { allowed: false, redirect: `/partners/admin/login?returnUrl=${returnUrl}` }
        }

        const sessionLocals = event.locals as unknown as Record<string, unknown>
        sessionLocals.session = recoveredSession
        return { allowed: true }
      },
      paths: ['/partners/admin', '/partners/admin/*'],
      exclude: ['/partners/admin/login'],
    },
    {
      guard: async (event, session) => {
        if (session) {
          return { allowed: true }
        }

        const token = event.cookies.get('corp_partner_access_token')
        if (!token) {
          return { allowed: false, status: 401, message: 'Unauthorized' }
        }

        const recoveredSession = await validateSession(token)
        if (!recoveredSession) {
          return { allowed: false, status: 401, message: 'Unauthorized' }
        }

        const sessionLocals = event.locals as unknown as Record<string, unknown>
        sessionLocals.session = recoveredSession
        return { allowed: true }
      },
      paths: ['/api/partners/admin/*'],
      exclude: ['/api/partners/admin/login'],
    },
  ],
  onError: (error: unknown) => {
    core.logger.error('Request error:', { error })
    return new Response(
      JSON.stringify({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An error occurred' } }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  },
})

export const handle: Handle = kit.sequence(i18nHandle, haiHandle)
