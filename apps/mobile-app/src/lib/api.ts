import { apiClient } from '@h-ai/api-client'
import { apiServiceContract } from '@h-ai/api-service-contract'
import { createCapacitorTokenStorage } from '@h-ai/capacitor'
import { crypto } from '@h-ai/crypto'
import { navigateToLogin } from './navigation.js'

const DEFAULT_API_BASE = 'http://localhost:3000/api/v1'
const DEFAULT_KEY_EXCHANGE_PATH = '/_hai/key-exchange'

export const mobileApiClient = apiClient.create(apiServiceContract)

let initialized = false
let cryptoTransportEnabled = false

async function isNativeCapacitor(): Promise<boolean> {
  const { Capacitor } = await import('@capacitor/core')
  return Capacitor.isNativePlatform()
}

async function createTokenStorage() {
  if (await isNativeCapacitor())
    return createCapacitorTokenStorage()

  return apiClient.tokenStorage.memory()
}

function resolveApiBase(): string {
  return import.meta.env.PUBLIC_API_BASE ?? DEFAULT_API_BASE
}

function resolveTransport() {
  if (import.meta.env.PUBLIC_API_TRANSPORT === 'off')
    return undefined

  return {
    crypto,
    keyExchangePath: import.meta.env.PUBLIC_API_KEY_EXCHANGE_PATH ?? DEFAULT_KEY_EXCHANGE_PATH,
  }
}

export async function initApi(): Promise<void> {
  if (initialized)
    return

  const transport = resolveTransport()
  if (transport) {
    const cryptoResult = await crypto.init()
    if (!cryptoResult.success)
      throw new Error(`Crypto initialization failed: ${cryptoResult.error.message}`)
  }

  const initResult = await mobileApiClient.init({
    baseUrl: resolveApiBase(),
    auth: {
      storage: await createTokenStorage(),
      refreshPath: '/auth/refresh',
      onRefreshFailed: () => {
        navigateToLogin()
      },
    },
    ...(transport ? { transport } : {}),
  })

  if (!initResult.success) {
    if (transport)
      await crypto.close()
    throw new Error(initResult.error.message)
  }

  initialized = true
  cryptoTransportEnabled = transport !== undefined
}

export async function closeApi(): Promise<void> {
  if (!initialized)
    return

  await mobileApiClient.close()
  if (cryptoTransportEnabled)
    await crypto.close()

  initialized = false
  cryptoTransportEnabled = false
}
