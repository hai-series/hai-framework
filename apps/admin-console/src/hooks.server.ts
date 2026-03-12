/**
 * =============================================================================
 * hai Admin Console - Server Hooks
 * =============================================================================
 * SvelteKit 服务端钩子配置
 * =============================================================================
 */

import type { Handle } from '@sveltejs/kit'
import process from 'node:process'
import { paraglideMiddleware } from '$lib/paraglide/server.js'
import { initApp } from '$lib/server/init.js'
import { crypto } from '@h-ai/crypto'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

// 初始化应用（包含数据库、缓存、IAM 等模块）
let appInitPromise: Promise<void> | null = null

// 服务端初始化加密模块 —— kit.createHandle 在模块加载时同步执行，
// 需要 crypto 模块就绪才能生成传输加密密钥对。
// crypto.init() 虽然签名为 async，但函数体无 await，副作用同步生效。
crypto.init()

async function ensureAppInitialized() {
  if (!appInitPromise) {
    appInitPromise = initApp().catch((err) => {
      // 初始化失败时清除缓存，允许下次请求重试
      appInitPromise = null
      throw err
    })
  }
  await appInitPromise
}

// =============================================================================
// Paraglide i18n Middleware
// =============================================================================

/**
 * i18n Handle - 使用 Paraglide middleware 处理语言
 *
 * 注意：API 请求跳过 paraglideMiddleware，因为：
 * 1. API 不需要页面级别的 locale 处理
 * 2. paraglideMiddleware 内部 new Request(request) 会消耗 body
 */
const i18nHandle: Handle = async ({ event, resolve }) => {
  await ensureAppInitialized()

  // API 请求不需要 i18n 处理，直接跳过
  // 避免 paraglideMiddleware 消耗 request body
  if (event.url.pathname.startsWith('/api/')) {
    const locale = event.cookies.get('PARAGLIDE_LOCALE') ?? 'zh-CN'
    event.locals.locale = locale
    kit.i18n.setLocale(locale)
    return resolve(event)
  }

  return paraglideMiddleware(event.request, async ({ locale }) => {
    event.locals.locale = locale
    kit.i18n.setLocale(locale)
    return resolve(event, {
      transformPageChunk: ({ html }) => html.replace('%lang%', locale),
    })
  })
}

/**
 * 会话验证 - 使用 IAM verifyToken（纯缓存，零 DB 查询）
 */
async function validateSession(token: string) {
  const result = await iam.auth.verifyToken(token)
  if (!result.success)
    return null

  const s = result.data

  // E2E 测试模式：仅在 NODE_ENV=test 时允许，防止生产环境误配导致权限提升
  if (process.env.HAI_E2E === '1' && process.env.NODE_ENV === 'test') {
    return {
      userId: s.userId,
      username: s.username,
      displayName: s.displayName,
      avatarUrl: s.avatarUrl,
      roles: ['admin'],
      permissions: [
        'dashboard:view',
        'user:read',
        'user:list',
        'user:create',
        'user:update',
        'user:delete',
        'user:api:create',
        'user:api:update',
        'user:api:delete',
        'role:read',
        'role:list',
        'role:create',
        'role:update',
        'role:delete',
        'role:api:create',
        'role:api:update',
        'role:api:delete',
        'permission:read',
        'permission:list',
        'permission:manage',
        'permission:create',
        'permission:delete',
        'permission:api:create',
        'permission:api:delete',
        'system:settings',
        'system:logs',
        'system:modules',
        'profile:read',
        'audit:read',
      ],
    }
  }

  return {
    userId: s.userId,
    username: s.username,
    displayName: s.displayName,
    avatarUrl: s.avatarUrl,
    roles: s.roles,
    permissions: s.permissions,
  }
}

/**
 * hai handle hook
 */
const haiHandle = kit.createHandle({
  auth: {
    verifyToken: validateSession,
    loginUrl: '/auth/login',
    protectedPaths: ['/admin/*', '/api/*'],
    publicPaths: ['/admin/public/*', '/api/auth/login', '/api/auth/register', '/api/public/*', '/api/kit/*'],
    operations: iam.auth,
  },
  rateLimit: {
    windowMs: 60000,
    maxRequests: process.env.HAI_E2E === '1' ? 5000 : 100,
  },
  crypto: {
    crypto,
    transport: { requireEncryption: false },
  },
})

export const handle: Handle = kit.sequence(i18nHandle, haiHandle)
