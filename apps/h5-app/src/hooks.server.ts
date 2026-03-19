/**
 * =============================================================================
 * hai H5 App - Server Hooks
 * =============================================================================
 */

import type { Handle } from '@sveltejs/kit'
import { AsyncLocalStorage } from 'node:async_hooks'
import { paraglideMiddleware } from '$lib/paraglide/server.js'
import { initApp } from '$lib/server/init.js'
import { core } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

let appInitPromise: Promise<void> | null = null
const requestLocaleStorage = new AsyncLocalStorage<string>()

core.i18n.setRequestLocaleResolver(() => requestLocaleStorage.getStore())

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
    return requestLocaleStorage.run(locale, () => resolve(event))
  }

  return paraglideMiddleware(event.request, async ({ locale }) => {
    event.locals.locale = locale
    return requestLocaleStorage.run(locale, () => resolve(event, {
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

const haiHandle = kit.createHandle({
  auth: {
    verifyToken: validateSession,
    cookieName: 'h5_access_token',
    protectedPaths: ['/api/user/*', '/api/vision/*', '/api/upload'],
    publicPaths: ['/api/auth/*'],
    operations: iam.auth,
  },
  rateLimit: { windowMs: 60000, maxRequests: 200 },
})

export const handle: Handle = kit.sequence(i18nHandle, haiHandle)
