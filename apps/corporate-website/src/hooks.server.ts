/**
 * SvelteKit Server Hooks — 企业官网
 */
import type { Handle } from '@sveltejs/kit'
import { initApp } from '$lib/server/init.js'
import { core } from '@h-ai/core'
import { kit } from '@h-ai/kit'

let appInitPromise: Promise<void> | null = null

async function ensureAppInitialized() {
  if (!appInitPromise) {
    appInitPromise = initApp().catch((err) => {
      appInitPromise = null
      throw err
    })
  }
  await appInitPromise
}

const initHandle: Handle = async ({ event, resolve }) => {
  await ensureAppInitialized()
  return resolve(event)
}

const haiHandle = kit.createHandle({
  middleware: [
    kit.middleware.logging({ logBody: false }),
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
