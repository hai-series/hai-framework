/**
 * =============================================================================
 * hai Corporate Website - Server Hooks
 * =============================================================================
 */

import type { Handle } from '@sveltejs/kit/hooks'
import process from 'node:process'
import { cache } from '@h-ai/cache'
import { core, HaiCommonError } from '@h-ai/core'
import { kit, KitConfigSchema } from '@h-ai/kit'
import { paraglideMiddleware } from '#lib/paraglide/server.js'
import { initApp } from '#lib/server/init.js'
import { getPartnerAdminSessionByToken } from '#lib/server/partner-service.js'

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
    return kit.i18n.runWithLocale(locale, () => resolve(event))
  }

  return paraglideMiddleware(event.request, async ({ locale }: { locale: string }) => {
    event.locals.locale = locale
    return kit.i18n.runWithLocale(locale, () => resolve(event, {
      transformPageChunk: ({ html }) => html.replace('%lang%', locale),

    }))
  })
}

// =============================================================================
// 会话验证
// =============================================================================

async function validateSession(token: string) {
  const session = await getPartnerAdminSessionByToken(token)
  if (!session) {
    return core.err(HaiCommonError.UNAUTHORIZED)
  }

  return core.ok({
    userId: session.userId,
    username: session.username,
    roles: [session.role],
    permissions: ['partner:records:read'],
  })
}

// =============================================================================
// hai Handle
// =============================================================================

let configuredHandle: Handle | undefined
const haiHandle: Handle = async (input) => {
  if (!configuredHandle) {
    const loaded = core.config.load('kit', './config/_kit.yml', KitConfigSchema)
    if (!loaded.success)
      throw new Error(loaded.error.message)
    if (loaded.data.transport !== false)
      throw new Error('This example does not install transport encryption; use admin-console or a crypto-enabled CLI template for the complete server and browser assembly')
    const { http } = loaded.data
    configuredHandle = kit.createHandle({
      cors: loaded.data.cors,
      http: {
        ...http,
        rateLimit: http.rateLimit && {
          ...http.rateLimit,
          store: core.access.createCacheRateLimitStore(cache, {
            namespace: 'corporate-website',
            allowMemory: process.env.NODE_ENV !== 'production' || process.env.HAI_E2E === '1' || process.env.HAI_E2E_MOCK === '1',
          }),
        },
      },
      auth: {
        verifyToken: validateSession,
        cookieName: 'corp_partner_access_token',
        loginUrl: '/partners/admin/login',
        protectedPaths: ['/partners/admin', '/partners/admin/*', '/api/partners/admin/*'],
        publicPaths: ['/partners/admin/login', '/api/partners/admin/login'],
      },
    })
  }
  return configuredHandle(input)
}

export const handle: Handle = kit.sequence(i18nHandle, haiHandle)
