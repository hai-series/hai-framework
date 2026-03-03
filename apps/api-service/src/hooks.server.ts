/**
 * =============================================================================
 * hai API Service - Server Hooks
 * =============================================================================
 */

import type { Handle } from '@sveltejs/kit'
import { initApp } from '$lib/server/init.js'
import { core } from '@h-ai/core'
import { kit } from '@h-ai/kit'

let appInitPromise: Promise<void> | null = null

async function ensureAppInitialized() {
  if (!appInitPromise) {
    appInitPromise = initApp().catch((e: unknown) => {
      appInitPromise = null
      throw e
    })
  }
  await appInitPromise
}

// =============================================================================
// 初始化 Handle
// =============================================================================

const initHandle: Handle = async ({ event, resolve }) => {
  await ensureAppInitialized()
  return resolve(event)
}

// =============================================================================
// hai Handle
// =============================================================================

const haiHandle = kit.createHandle({
  middleware: [
    kit.middleware.logging({ logBody: false }),
    kit.middleware.rateLimit({ windowMs: 60000, maxRequests: 200 }),
  ],
  onError: (error: unknown) => {
    core.logger.error('Request error:', { error })
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  },
})

export const handle: Handle = kit.sequence(initHandle, haiHandle)
