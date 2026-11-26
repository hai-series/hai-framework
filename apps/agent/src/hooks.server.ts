import type { KitConfig } from '@h-ai/kit'
import type { Handle } from '@sveltejs/kit/hooks'
import process from 'node:process'
import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'
import { paraglideMiddleware } from '#lib/paraglide/server.js'
import { production } from '#lib/server/config.js'
import { value } from '#lib/server/data.js'
import { runtime } from '#lib/server/init.js'

export async function init() {
  value(await runtime.start())
}

process.once('sveltekit:shutdown', () => {
  void runtime.close().then((closed) => {
    if (!closed.success) {
      core.logger.error('Agent shutdown failed', { code: closed.error.code })
      process.exitCode = 1
    }
  })
})

let configuredSecurity: Handle | undefined
const security: Handle = (input) => {
  if (!configuredSecurity) {
    const { cors, http, transport } = core.config.getOrThrow<KitConfig>('kit')
    if (transport !== false)
      throw new Error('Agent does not install Kit transport encryption')
    configuredSecurity = kit.createHandle({
      cors,
      http: {
        ...http,
        rateLimit: http.rateLimit && {
          ...http.rateLimit,
          store: core.access.createCacheRateLimitStore(cache, { namespace: 'agent', allowMemory: !production() }),
        },
      },
    })
  }
  return configuredSecurity(input)
}

const session: Handle = async ({ event, resolve }) => {
  const cookie = event.cookies.get('agent_session')
  if (cookie) {
    const verified = await iam.auth.verifyToken(cookie)
    if (verified.success) {
      event.locals.agentUser = {
        id: verified.data.userId,
        name: verified.data.displayName || verified.data.username || verified.data.userId,
      }
    }
  }
  if (event.url.pathname.includes('/api/')) {
    return paraglideMiddleware(event.request, ({ locale }) => kit.i18n.runWithLocale(locale, async () => {
      const response = await resolve(event)
      response.headers.set('Cache-Control', 'no-store')
      response.headers.set('X-Content-Type-Options', 'nosniff')
      return response
    }))
  }
  // 语言由工作区的默认配置或 Paraglide 语言 Cookie 决定。
  if (!event.cookies.get('PARAGLIDE_LOCALE')) {
    const locale = core.config.get<{ defaultLocale?: string }>('core')?.defaultLocale
    if (locale === 'en-US' || locale === 'ja-JP')
      event.cookies.set('PARAGLIDE_LOCALE', locale, { path: '/', sameSite: 'lax' })
  }
  return paraglideMiddleware(event.request, ({ locale }) =>
    kit.i18n.runWithLocale(locale, () => resolve(event, {
      transformPageChunk: ({ html }) => html.replace('%lang%', locale),
    })))
}

const requestHandle = kit.sequence(security, session)
export const handle: Handle = async (input) => {
  const response = await requestHandle(input)
  // 同源 HTML 表单需携带 Origin，跨域导航仍省略 Referrer。
  if (response.headers.get('Content-Type')?.includes('text/html'))
    response.headers.set('Referrer-Policy', 'same-origin')
  return response
}
