/**
 * =============================================================================
 * hai API Service - Server Hooks
 * =============================================================================
 */

import type { Handle } from '@sveltejs/kit'
import { initApp } from '$lib/server/init.js'
import { ai } from '@h-ai/ai'
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
// hai Handle（含 A2A 自动端点）
// =============================================================================

const haiHandle = kit.createHandle({
  rateLimit: { windowMs: 60000, maxRequests: 200 },
  a2a: ai.a2a,
})

export const handle: Handle = kit.sequence(initHandle, haiHandle)
