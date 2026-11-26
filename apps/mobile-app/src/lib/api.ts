import { apiClient } from '@h-ai/api-client'
import { apiServiceContract } from '@h-ai/api-service-contract'
import { capacitor } from '@h-ai/capacitor'
import { core } from '@h-ai/core'
import { crypto } from '@h-ai/crypto'
import { navigateToLogin } from './navigation.js'

const DEFAULT_API_BASE = 'http://localhost:3000/api/v1'

export const mobileApiClient = apiClient.create(apiServiceContract)

let initialized = false
let cryptoTransportEnabled = false

async function isNativeCapacitor(): Promise<boolean> {
  const { Capacitor } = await import('@capacitor/core')
  return Capacitor.isNativePlatform()
}

async function createTokenStorage() {
  if (await isNativeCapacitor())
    return capacitor.createTokenStorage()

  return apiClient.tokenStorage.httpOnlyCookie()
}

function resolveApiBase(native: boolean): string {
  const runtime = (globalThis as typeof globalThis & { __HAI_PUBLIC_CONFIG__?: { apiBase?: string } }).__HAI_PUBLIC_CONFIG__
  const origin = globalThis.location?.origin
  const fallback = native || !origin
    ? DEFAULT_API_BASE
    : `${origin}/api/v1`
  return runtime?.apiBase || import.meta.env.PUBLIC_API_BASE || fallback
}

function resolveTransport() {
  const runtime = (globalThis as typeof globalThis & { __HAI_PUBLIC_CONFIG__?: { apiTransport?: string, apiKeyExchangePath?: string } }).__HAI_PUBLIC_CONFIG__
  if ((runtime?.apiTransport || import.meta.env.PUBLIC_API_TRANSPORT) === 'off')
    return undefined

  const keyExchangePath: unknown = runtime?.apiKeyExchangePath ?? import.meta.env.PUBLIC_API_KEY_EXCHANGE_PATH ?? crypto.transport.protocol.DEFAULT_KEY_EXCHANGE_PATH
  if (!crypto.transport.isKeyExchangePath(keyExchangePath))
    throw new TypeError(`${core.i18n.coreM('core_configValidationFailed')} (PUBLIC_API_KEY_EXCHANGE_PATH)`)
  return {
    crypto,
    keyExchangePath,
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

  const native = await isNativeCapacitor()
  const initResult = await mobileApiClient.init({
    baseUrl: resolveApiBase(native),
    clientName: 'hai-mobile-app',
    headers: native
      ? { 'x-hai-token-transport': 'body' }
      : {},
    auth: {
      storage: await createTokenStorage(),
      onRefreshFailed: () => {
        navigateToLogin()
      },
    },
    ...(transport
      ? { transport }
      : {}),
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
