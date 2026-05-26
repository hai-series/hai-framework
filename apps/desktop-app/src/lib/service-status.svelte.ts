/**
 * @file src/lib/service-status.svelte.ts
 *
 * 管理 api-service 自定义 `app.*` 端点的桌面端状态：
 * - `app.info`：公开服务元信息
 * - `app.echo`：已登录后回显消息，验证 transport + auth + 自定义 contract 是否联通
 */

import { desktopApiClient } from './api.js'

export type ServiceInfo = Extract<
  Awaited<ReturnType<typeof desktopApiClient.app.info>>,
  { success: true }
>['data']

export type EchoResult = Extract<
  Awaited<ReturnType<typeof desktopApiClient.app.echo>>,
  { success: true }
>['data']

let serviceInfo = $state<ServiceInfo | null>(null)
let serviceInfoLoading = $state(false)
let serviceInfoError = $state<string | null>(null)

let echoLoading = $state(false)
let echoError = $state<string | null>(null)
let lastEcho = $state<EchoResult | null>(null)

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
  try {
    const result = await desktopApiClient.app.info()
    if (!result.success) {
      serviceInfo = null
      serviceInfoError = String(result.error.code ?? 'unknown')
      return
    }
    serviceInfo = result.data
  }
  finally {
    serviceInfoLoading = false
  }
}

export async function sendEcho(message: string): Promise<void> {
  echoLoading = true
  echoError = null
  try {
    const result = await desktopApiClient.app.echo({ message })
    if (!result.success) {
      lastEcho = null
      echoError = String(result.error.code ?? 'unknown')
      return
    }
    lastEcho = result.data
  }
  finally {
    echoLoading = false
  }
}
