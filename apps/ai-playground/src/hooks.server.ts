/**
 * SvelteKit 服务端 hooks
 *
 * 每个请求前确保 AI 已初始化，设置 i18n locale 与安全响应头；并接入 kit 的限流/CORS 处理链。
 * @module hooks.server
 */

import type { Handle } from '@sveltejs/kit'
import process from 'node:process'
import { paraglideMiddleware } from '$lib/paraglide/server.js'
import { ensureAIInitialized } from '$lib/server/init.js'
import { kit } from '@h-ai/kit'

// 初始化 AI（E2E mock 模式跳过）、设置 locale 与 API 安全响应头
const securityHandle: Handle = async ({ event, resolve }) => {
  if (process.env.HAI_E2E_MOCK !== '1')
    await ensureAIInitialized()

  if (event.url.pathname.startsWith('/api/')) {
    event.locals.locale = event.cookies.get('PARAGLIDE_LOCALE') ?? 'zh-CN'
    kit.i18n.setLocale(event.locals.locale)
    const response = await resolve(event)
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('Cache-Control', 'no-store')
    return response
  }

  return paraglideMiddleware(event.request, async ({ locale }: { locale: string }) => {
    event.locals.locale = locale
    kit.i18n.setLocale(locale)
    return resolve(event, {
      transformPageChunk: ({ html }) => html.replace('%lang%', locale),
    })
  })
}

const haiHandle = kit.createHandle({
  rateLimit: { windowMs: 60000, maxRequests: 120 },
})

export const handle: Handle = kit.sequence(securityHandle, haiHandle)
