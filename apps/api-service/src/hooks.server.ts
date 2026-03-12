/**
 * =============================================================================
 * hai API Service - Server Hooks
 * =============================================================================
 */

import type { Handle } from '@sveltejs/kit'
import { initApp } from '$lib/server/init.js'
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
  rateLimit: { windowMs: 60000, maxRequests: 200 },
})

export const handle: Handle = kit.sequence(initHandle, haiHandle)
