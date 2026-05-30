import { mobileApiClient } from '../api.js'

export type ServiceInfo = Extract<
  Awaited<ReturnType<typeof mobileApiClient.app.info>>,
  { success: true }
>['data']

export type EchoResult = Extract<
  Awaited<ReturnType<typeof mobileApiClient.app.echo>>,
  { success: true }
>['data']

let serviceInfo = $state<ServiceInfo | null>(null)
let serviceInfoLoading = $state(false)
let serviceInfoError = $state<string | null>(null)
let echoLoading = $state(false)
let echoError = $state<string | null>(null)
let lastEcho = $state<EchoResult | null>(null)

function resolveResultError(result: { error?: { code?: unknown, message?: unknown } }): string {
  if (typeof result.error?.message === 'string' && result.error.message.trim())
    return result.error.message
  if (result.error?.code !== undefined)
    return String(result.error.code)
  return 'unknown'
}

export function currentServiceInfo(): ServiceInfo | null {
  return serviceInfo
}

export function isServiceInfoLoading(): boolean {
  return serviceInfoLoading
}

export function currentServiceInfoError(): string | null {
  return serviceInfoError
}

export function isEchoLoading(): boolean {
  return echoLoading
}

export function currentEchoError(): string | null {
  return echoError
}

export function currentEchoResult(): EchoResult | null {
  return lastEcho
}

export async function refreshServiceInfo(): Promise<void> {
  serviceInfoLoading = true
  serviceInfoError = null
  const result = await mobileApiClient.app.info()
  if (!result.success) {
    serviceInfo = null
    serviceInfoError = resolveResultError(result)
    serviceInfoLoading = false
    return
  }
  serviceInfo = result.data
  serviceInfoLoading = false
}

export async function sendEcho(message: string): Promise<void> {
  echoLoading = true
  echoError = null
  const result = await mobileApiClient.app.echo({ message })
  if (!result.success) {
    lastEcho = null
    echoError = resolveResultError(result)
    echoLoading = false
    return
  }
  lastEcho = result.data
  echoLoading = false
}
