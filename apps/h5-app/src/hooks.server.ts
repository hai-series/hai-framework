/**
 * =============================================================================
 * hai H5 App - Server Hooks
 * =============================================================================
 */

import type { Handle } from '@sveltejs/kit'
import process from 'node:process'
import { paraglideMiddleware } from '$lib/paraglide/server.js'
import { initApp } from '$lib/server/init.js'
import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { kit, KitConfigSchema } from '@h-ai/kit'

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

  return paraglideMiddleware(event.request, async ({ locale }) => {
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
  const result = await iam.auth.verifyToken(token)
  if (!result.success)
    return null

  const s = result.data
  return {
    userId: s.userId,
    username: s.username,
    displayName: s.displayName,
    avatarUrl: s.avatarUrl,
    roles: s.roles,
    permissions: s.permissions,
  }
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
    configuredHandle = kit.createHandle({
      trustedProxies: loaded.data.trustedProxies,
      access: loaded.data.access,
      auth: {
        verifyToken: validateSession,
        cookieName: 'h5_access_token',
        protectedPaths: ['/api/user/*', '/api/vision/*', '/api/upload'],
        publicPaths: kit.auth.publicPaths,
        operations: () => iam.auth,
      },
      rateLimit: { windowMs: 60000, maxRequests: 200, store: kit.middleware.createCacheRateLimitStore(cache, { namespace: 'h5-app', allowMemory: process.env.NODE_ENV !== 'production' || process.env.HAI_E2E === '1' || process.env.HAI_E2E_MOCK === '1' }) },
    })
  }
  return configuredHandle(input)
}

export const handle: Handle = kit.sequence(i18nHandle, haiHandle)
