/**
 * @h-ai/payment — Provider HTTP 辅助
 *
 * 为各支付 Provider 的 fetch 请求统一附加超时控制。
 * @module payment-provider-http
 */

const DEFAULT_PROVIDER_TIMEOUT_MS = 15_000

export async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs = DEFAULT_PROVIDER_TIMEOUT_MS): Promise<Response> {
  return fetch(input, {
    ...init,
    signal: init.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(timeoutMs)])
      : AbortSignal.timeout(timeoutMs),
  })
}
