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
import { cache, CacheConfigSchema } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { kit, KitConfigSchema } from '@h-ai/kit'

// 初始化 AI（E2E mock 模式跳过）、设置 locale 与 API 安全响应头
let rateLimitInit: Promise<void> | undefined

/** 准备共享限流；生产配置memory时由限流store失败关闭。 */
async function ensureRateLimit(): Promise<void> {
  if (!rateLimitInit) {
    rateLimitInit = (async () => {
      if (!core.config.has('cache'))
        core.init({ configDir: './config', configSchemas: { cache: CacheConfigSchema } })
      const config = core.config.validate('cache', CacheConfigSchema)
      if (!config.success)
        throw new Error('Rate limit cache configuration is invalid')
      const initialized = await cache.init(config.data)
      if (!initialized.success)
        throw new Error('Rate limit cache initialization failed')
    })().catch((cause: unknown) => {
      rateLimitInit = undefined
      throw cause
    })
  }
  await rateLimitInit
}

// 初始化 AI（E2E mock 模式跳过）与限流，设置 locale 和安全响应头。
const securityHandle: Handle = async ({ event, resolve }) => {
  if (process.env.HAI_E2E_MOCK !== '1')
    await ensureAIInitialized()
  await ensureRateLimit()

  if (event.url.pathname.startsWith('/api/')) {
    event.locals.locale = event.cookies.get('PARAGLIDE_LOCALE') ?? 'zh-CN'
    const response = await kit.i18n.runWithLocale(event.locals.locale, () => resolve(event))
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('Cache-Control', 'no-store')
    return response
  }

  return paraglideMiddleware(event.request, async ({ locale }: { locale: string }) => {
    event.locals.locale = locale
    return kit.i18n.runWithLocale(locale, () => resolve(event, {
      transformPageChunk: ({ html }) => html.replace('%lang%', locale),
    }))
  })
}

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
      rateLimit: { windowMs: 60000, maxRequests: 120, store: kit.middleware.createCacheRateLimitStore(cache, { namespace: 'ai-playground', allowMemory: process.env.NODE_ENV !== 'production' || process.env.HAI_E2E === '1' || process.env.HAI_E2E_MOCK === '1' }) },
    })
  }
  return configuredHandle(input)
}

export const handle: Handle = kit.sequence(securityHandle, haiHandle)
