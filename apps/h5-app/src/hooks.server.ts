/**
 * SvelteKit 服务端钩子 — H5 应用
 */
import type { Handle } from '@sveltejs/kit'
import { initApp } from '$lib/server/init'
import { core } from '@h-ai/core'
import { iam } from '@h-ai/iam'
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

/**
 * 会话验证
 */
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
    roles: s.roleCodes,
    permissions: s.permissionCodes,
  }
}

const initHandle: Handle = async ({ event, resolve }) => {
  await ensureAppInitialized()
  return resolve(event)
}

const haiHandle = kit.createHandle({
  sessionCookieName: 'h5_session',
  validateSession,
  middleware: [
    kit.middleware.logging({ logBody: false }),
    kit.middleware.rateLimit({ windowMs: 60000, maxRequests: 200 }),
  ],
  guards: [
    {
      guard: kit.guard.auth({ apiMode: true }),
      paths: ['/api/user/*'],
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

export const handle: Handle = kit.sequence(initHandle, haiHandle)
